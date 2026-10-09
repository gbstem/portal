const mockSendEmail = jest.fn()

/** Every document the fake Firestore holds, by path. */
let docs: Record<string, any>
let transaction: { get: jest.Mock; set: jest.Mock }

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    doc: (path: string) => ({
      path,
      get: async () => ({ exists: path in docs, data: () => docs[path] }),
    }),
    runTransaction: (fn: (t: any) => Promise<any>) => fn(transaction),
  },
}))
jest.mock('#lib/server/email.js', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))
jest.mock('#lib/emails/render.js', () => ({
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
  applicationsCollection,
  currentSemester,
} from '#lib/data/collections.js'
import { createEmptyApplication } from '#lib/helpers/applyForm.js'
import {
  loadApplication,
  saveApplicationDraft,
  submitApplication,
} from '#lib/server/instructorApplication.js'
import type {} from '../src/data.d.ts'

const CALLER = { uid: 'instructor-uid', email: 'now@example.com' }
const APP_PATH = `${applicationsCollection}/${CALLER.uid}`
const PROFILE_PATH = `users/${CALLER.uid}`
const BEFORE_DEADLINE = new Date('2026-01-01T00:00:00Z')
const DEADLINE = new Date('2026-01-02T00:00:00Z')

function storedApplication(meta: Partial<Data.Application['meta']> = {}) {
  const app = createEmptyApplication()
  app.personal.firstName = 'Ada'
  app.personal.lastName = 'Lovelace'
  app.personal.email = 'then@example.com'
  app.personal.phoneNumber = '5551112222'
  app.meta = { ...app.meta, uid: CALLER.uid, ...meta }
  app.timestamps = { created: 'CREATED' as any, updated: 'UPDATED' as any }
  return app
}

function completeForm() {
  return {
    personal: {
      phoneNumber: '5559998888',
      dateOfBirth: '2005-10-10',
      gender: 'Female',
      race: ['White'],
    },
    academic: { school: 'MIT', graduationYear: 2028 },
    program: {
      courses: ['Python 1'],
      preferences: '',
      timeSlots: 'Weekends',
      notAvailable: 'None',
      inPerson: false,
      reason: 'School',
    },
    essay: {
      taughtBefore: false,
      academicBackground: 'Coursework',
      teachingScenario: 'Games',
      why: 'Kids',
    },
    agreements: { entireProgram: true, timeCommitment: true, submitting: true },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  docs = { [PROFILE_PATH]: { firstName: 'Ada', lastName: 'Lovelace' } }
  transaction = {
    get: jest.fn(async (ref: { path: string }) => ({
      exists: ref.path in docs,
      data: () => docs[ref.path],
    })),
    set: jest.fn(),
  }
  mockSendEmail.mockResolvedValue(undefined)
})

describe('loadApplication', () => {
  it('creates the whole default draft on the first visit', async () => {
    const view = await loadApplication(CALLER)

    expect(transaction.set).toHaveBeenCalledTimes(1)
    const [ref, written, options] = transaction.set.mock.calls[0]
    expect(ref.path).toBe(APP_PATH)
    expect(options).toBeUndefined()
    expect(written).toEqual(
      expect.objectContaining({
        semester: currentSemester,
        meta: {
          uid: CALLER.uid,
          submitted: false,
          interview: false,
          decided: false,
        },
        personal: expect.objectContaining({
          email: CALLER.email,
          firstName: 'Ada',
          lastName: 'Lovelace',
        }),
      }),
    )
    expect(view.submitted).toBe(false)
    expect(view.firstName).toBe('Ada')
  })

  it('refreshes a draft whose names no longer match the profile', async () => {
    docs[APP_PATH] = storedApplication()
    docs[PROFILE_PATH] = { firstName: 'Augusta', lastName: 'King' }

    const view = await loadApplication(CALLER)

    expect(transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: APP_PATH }),
      {
        personal: {
          firstName: 'Augusta',
          lastName: 'King',
          email: CALLER.email,
        },
      },
      { merge: true },
    )
    expect(view.firstName).toBe('Augusta')
    expect(view.values.personal.phoneNumber).toBe('5551112222')
  })

  it('leaves a submitted application, names included, untouched', async () => {
    docs[APP_PATH] = storedApplication({ submitted: true })
    docs[PROFILE_PATH] = { firstName: 'Augusta', lastName: 'King' }

    const view = await loadApplication(CALLER)

    expect(transaction.set).not.toHaveBeenCalled()
    expect(view).toEqual(
      expect.objectContaining({
        submitted: true,
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    )
  })
})

describe('saveApplicationDraft', () => {
  it('merges the form fields and never sends meta', async () => {
    docs[APP_PATH] = storedApplication()

    await saveApplicationDraft(CALLER, completeForm() as any)

    const [, written, options] = transaction.set.mock.calls[0]
    expect(options).toEqual({ merge: true })
    expect(written.meta).toBeUndefined()
    expect(written.personal).toEqual(
      expect.objectContaining({
        phoneNumber: '5559998888',
        email: CALLER.email,
        firstName: 'Ada',
      }),
    )
    expect(written.timestamps).toEqual({
      created: 'CREATED',
      updated: 'SERVER_TIMESTAMP',
    })
  })

  it('refuses once the application is submitted', async () => {
    docs[APP_PATH] = storedApplication({ submitted: true })

    await expect(
      saveApplicationDraft(CALLER, completeForm() as any),
    ).rejects.toMatchObject({ status: 409 })
    expect(transaction.set).not.toHaveBeenCalled()
  })

  it('refuses when there is no application to save into', async () => {
    await expect(
      saveApplicationDraft(CALLER, completeForm() as any),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('submitApplication', () => {
  it('marks the application submitted and emails the applicant', async () => {
    docs[APP_PATH] = storedApplication({ decided: false })

    const result = await submitApplication(
      CALLER,
      completeForm() as any,
      DEADLINE,
      BEFORE_DEADLINE,
    )

    const [, written, options] = transaction.set.mock.calls[0]
    expect(options).toEqual({ merge: true })
    // Only `submitted`: `interview` and `decided` are admin's.
    expect(written.meta).toEqual({ submitted: true })
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: CALLER.email,
        subject: 'Next steps for your gbSTEM application',
      }),
    )
    expect(result).toEqual({ emailSent: true })
  })

  it('reports, rather than throws, a failed confirmation email', async () => {
    docs[APP_PATH] = storedApplication()
    mockSendEmail.mockRejectedValueOnce(new Error('smtp down'))
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await submitApplication(
      CALLER,
      completeForm() as any,
      DEADLINE,
      BEFORE_DEADLINE,
    )

    expect(transaction.set).toHaveBeenCalled()
    expect(result).toEqual({ emailSent: false })
    errorSpy.mockRestore()
  })

  it('refuses at and after the deadline', async () => {
    docs[APP_PATH] = storedApplication()

    await expect(
      submitApplication(CALLER, completeForm() as any, DEADLINE, DEADLINE),
    ).rejects.toMatchObject({ status: 403 })
    expect(transaction.set).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('refuses an already-submitted application without emailing', async () => {
    docs[APP_PATH] = storedApplication({ submitted: true })

    await expect(
      submitApplication(
        CALLER,
        completeForm() as any,
        DEADLINE,
        BEFORE_DEADLINE,
      ),
    ).rejects.toMatchObject({ status: 409 })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
