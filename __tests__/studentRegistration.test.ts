const mockSendEmail = jest.fn()

/** Every document the fake Firestore holds, by path. */
let docs: Record<string, any>
let transaction: { get: jest.Mock; set: jest.Mock }

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (path: string) => ({
      path,
      get: async () => ({ exists: path in docs, data: () => docs[path] }),
    }),
    runTransaction: (fn: (t: any) => Promise<any>) => fn(transaction),
  },
}))
jest.mock('$lib/server/email', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))
jest.mock('$lib/emails/render', () => ({
  renderEmail: (name: string) => `<html>${name}</html>`,
}))
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}))
jest.mock(
  '@sveltejs/kit',
  () => ({
    error: (status: number, message: string) => {
      const err: any = new Error(message)
      err.status = status
      return err
    },
  }),
  { virtual: true },
)

import {
  currentSemester,
  maxChildrenPerAccount,
  registrationsCollection,
} from '$lib/data/collections'
import { createEmptyRegistration } from '$lib/helpers/registrationForm'
import {
  isOpenableChild,
  listChildren,
  loadRegistration,
  saveRegistrationDraft,
  submitRegistration,
} from '$lib/server/studentRegistration'
import type {} from '../src/data.d.ts'

const CALLER = { uid: 'parent-uid', email: 'now@example.com' }
const PROFILE_PATH = `users/${CALLER.uid}`
const regPath = (n: number) => `${registrationsCollection}/${CALLER.uid}-${n}`
const OPENS = new Date('2026-08-05T04:00:00Z')
const CLOSES = new Date('2026-10-04T04:00:00Z')
const WINDOW = { opens: OPENS, closes: CLOSES }
const DURING = new Date('2026-09-01T00:00:00Z')

function storedRegistration(
  child: number,
  overrides: {
    meta?: Partial<Data.Registration['meta']>
    studentFirstName?: string
  } = {},
) {
  const reg = createEmptyRegistration()
  reg.personal.parentFirstName = 'Lucy'
  reg.personal.parentLastName = 'Brown'
  reg.personal.email = 'then@example.com'
  reg.personal.studentFirstName = overrides.studentFirstName ?? ''
  reg.agreements.bypassAgeLimits = true
  reg.meta = { ...reg.meta, uid: `${CALLER.uid}-${child}`, ...overrides.meta }
  reg.timestamps = { created: 'CREATED' as any, updated: 'UPDATED' as any }
  return reg
}

function completeForm(secondaryEmail = '') {
  return {
    personal: {
      studentFirstName: 'Sally',
      studentLastName: 'Brown',
      secondaryEmail,
      phoneNumber: '5550142000',
      dateOfBirth: '2017-03-09',
      gender: 'Female',
      race: ['White'],
      frlp: 'No',
      parentEducation: "Master's degree",
    },
    academic: { school: 'Riverdale', grade: '3' },
    program: {
      csCourse: '',
      mathCourse: '',
      engineeringCourse: '',
      scienceCourse: '',
      inPerson: false,
      reason: '',
    },
    inPerson: { allergies: '', parentPickup: '' },
    agreements: {
      mediaRelease: true,
      // Admin-only: the form must never be able to set it.
      bypassAgeLimits: false,
      entireProgram: true,
      timeCommitment: true,
      submitting: true,
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  docs = { [PROFILE_PATH]: { firstName: 'Lucy', lastName: 'Brown' } }
  transaction = {
    get: jest.fn(async (ref: { path: string }) => ({
      exists: ref.path in docs,
      data: () => docs[ref.path],
    })),
    set: jest.fn(),
  }
  mockSendEmail.mockResolvedValue(undefined)
})

describe('listChildren', () => {
  it('lists the children in order, named or numbered', async () => {
    docs[regPath(1)] = storedRegistration(1, { studentFirstName: 'Sally' })
    docs[regPath(2)] = storedRegistration(2, { meta: { submitted: true } })

    expect(await listChildren(CALLER.uid)).toEqual([
      { number: 1, name: 'Sally', submitted: false },
      { number: 2, name: 'Child 2', submitted: true },
    ])
  })

  it('stops at the first gap', async () => {
    docs[regPath(1)] = storedRegistration(1)
    docs[regPath(3)] = storedRegistration(3)

    expect(await listChildren(CALLER.uid)).toHaveLength(1)
  })
})

describe('isOpenableChild', () => {
  it('allows an existing child or the next one', () => {
    expect(isOpenableChild(1, 0)).toBe(true)
    expect(isOpenableChild(2, 2)).toBe(true)
    expect(isOpenableChild(3, 2)).toBe(true)
  })

  it('refuses gaps, non-numbers and anything past the limit', () => {
    expect(isOpenableChild(4, 2)).toBe(false)
    expect(isOpenableChild(0, 2)).toBe(false)
    expect(isOpenableChild(1.5, 2)).toBe(false)
    expect(isOpenableChild(NaN, 2)).toBe(false)
    expect(
      isOpenableChild(maxChildrenPerAccount + 1, maxChildrenPerAccount),
    ).toBe(false)
  })
})

describe('loadRegistration', () => {
  it('creates the whole default draft the first time a child is opened', async () => {
    const view = await loadRegistration(CALLER, 2, true)

    const [ref, written, options] = transaction.set.mock.calls[0]
    expect(ref.path).toBe(regPath(2))
    expect(options).toBeUndefined()
    expect(written).toEqual(
      expect.objectContaining({
        semester: currentSemester,
        meta: { uid: `${CALLER.uid}-2`, submitted: false },
        timestamps: {
          created: 'SERVER_TIMESTAMP',
          updated: 'SERVER_TIMESTAMP',
        },
        personal: expect.objectContaining({
          email: CALLER.email,
          parentFirstName: 'Lucy',
          parentLastName: 'Brown',
        }),
      }),
    )
    expect(view).toEqual(
      expect.objectContaining({ submitted: false, parentFirstName: 'Lucy' }),
    )
  })

  it('neither reads nor writes before registration opens', async () => {
    expect(await loadRegistration(CALLER, 1, false)).toBeNull()
    expect(transaction.get).not.toHaveBeenCalled()
    expect(transaction.set).not.toHaveBeenCalled()
  })

  it("refreshes a draft's parent names from the profile", async () => {
    docs[regPath(1)] = storedRegistration(1)
    docs[PROFILE_PATH] = { firstName: 'Lucille', lastName: 'Van Pelt' }

    const view = await loadRegistration(CALLER, 1, true)

    expect(transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: regPath(1) }),
      {
        personal: {
          parentFirstName: 'Lucille',
          parentLastName: 'Van Pelt',
          email: CALLER.email,
        },
      },
      { merge: true },
    )
    expect(view?.parentFirstName).toBe('Lucille')
  })

  it('leaves a submitted registration untouched', async () => {
    docs[regPath(1)] = storedRegistration(1, { meta: { submitted: true } })
    docs[PROFILE_PATH] = { firstName: 'Lucille', lastName: 'Van Pelt' }

    const view = await loadRegistration(CALLER, 1, true)

    expect(transaction.set).not.toHaveBeenCalled()
    expect(view).toEqual(
      expect.objectContaining({ submitted: true, parentFirstName: 'Lucy' }),
    )
  })
})

describe('saveRegistrationDraft', () => {
  it('merges the form fields, never meta or the admin-only waiver', async () => {
    docs[regPath(1)] = storedRegistration(1)

    await saveRegistrationDraft(
      CALLER,
      1,
      completeForm() as any,
      WINDOW,
      DURING,
    )

    const [ref, written, options] = transaction.set.mock.calls[0]
    expect(ref.path).toBe(regPath(1))
    expect(options).toEqual({ merge: true })
    expect(written.meta).toBeUndefined()
    expect(written.agreements).not.toHaveProperty('bypassAgeLimits')
    expect(written.personal).toEqual(
      expect.objectContaining({
        studentFirstName: 'Sally',
        email: CALLER.email,
        parentFirstName: 'Lucy',
      }),
    )
  })

  it('refuses before registration opens', async () => {
    docs[regPath(1)] = storedRegistration(1)

    await expect(
      saveRegistrationDraft(
        CALLER,
        1,
        completeForm() as any,
        WINDOW,
        new Date(OPENS.getTime() - 1),
      ),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('refuses once the registration is submitted', async () => {
    docs[regPath(1)] = storedRegistration(1, { meta: { submitted: true } })

    await expect(
      saveRegistrationDraft(CALLER, 1, completeForm() as any, WINDOW, DURING),
    ).rejects.toMatchObject({ status: 409 })
    expect(transaction.set).not.toHaveBeenCalled()
  })

  it('refuses a child with no registration to save into', async () => {
    await expect(
      saveRegistrationDraft(CALLER, 3, completeForm() as any, WINDOW, DURING),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('submitRegistration', () => {
  it('marks it submitted and emails the parent', async () => {
    docs[regPath(1)] = storedRegistration(1)

    const result = await submitRegistration(
      CALLER,
      1,
      completeForm() as any,
      WINDOW,
      DURING,
    )

    const [, written] = transaction.set.mock.calls[0]
    expect(written.meta).toEqual({ submitted: true })
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: CALLER.email,
        subject: 'Next steps for your gbSTEM registration',
      }),
    )
    expect(result).toEqual({ emailSent: true })
  })

  it("copies the second guardian's address", async () => {
    docs[regPath(1)] = storedRegistration(1)

    await submitRegistration(
      CALLER,
      1,
      completeForm('guardian@example.com') as any,
      WINDOW,
      DURING,
    )

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [CALLER.email, 'guardian@example.com'],
      }),
    )
  })

  it('reports, rather than throws, a failed confirmation email', async () => {
    docs[regPath(1)] = storedRegistration(1)
    mockSendEmail.mockRejectedValueOnce(new Error('smtp down'))
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await submitRegistration(
      CALLER,
      1,
      completeForm() as any,
      WINDOW,
      DURING,
    )

    expect(transaction.set).toHaveBeenCalled()
    expect(result).toEqual({ emailSent: false })
    errorSpy.mockRestore()
  })

  it.each([
    ['before registration opens', new Date(OPENS.getTime() - 1)],
    ['once registration has closed', CLOSES],
  ])('refuses %s', async (_when, now) => {
    docs[regPath(1)] = storedRegistration(1)

    await expect(
      submitRegistration(CALLER, 1, completeForm() as any, WINDOW, now),
    ).rejects.toMatchObject({ status: 403 })
    expect(transaction.set).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('refuses an already-submitted registration without emailing', async () => {
    docs[regPath(1)] = storedRegistration(1, { meta: { submitted: true } })

    await expect(
      submitRegistration(CALLER, 1, completeForm() as any, WINDOW, DURING),
    ).rejects.toMatchObject({ status: 409 })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
