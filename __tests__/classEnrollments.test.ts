const mockDoc = jest.fn()
const mockRunTransaction = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
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
  classesCollection,
  registrationsCollection,
} from '$lib/data/collections'
import {
  enrollStudent,
  isOwnRegistration,
  unenrollStudent,
} from '$lib/server/classEnrollments'

const PARENT = { uid: 'parent-uid' }
const STUDENT = 'parent-uid-1'
const CLASS_ID = 'teacher-uid-1'
const CLASS_PATH = `${classesCollection}/${CLASS_ID}`
const REGISTRATION_PATH = `${registrationsCollection}/${STUDENT}`

/** Every document the fake Firestore holds, by path. */
let docs: Record<string, any>
let transaction: { get: jest.Mock; update: jest.Mock }

function snapshot(path: string) {
  return { exists: path in docs, data: () => docs[path] }
}

/** The update the transaction made to `path`, or undefined if it made none. */
function updateTo(path: string) {
  const call = transaction.update.mock.calls.find(([ref]) => ref.path === path)
  return call?.[1]
}

beforeEach(() => {
  jest.clearAllMocks()
  docs = {
    [CLASS_PATH]: {
      course: 'Python 1',
      classCap: 3,
      students: ['someone-else'],
    },
    [REGISTRATION_PATH]: {
      personal: { studentFirstName: 'Ada', studentLastName: 'Lovelace' },
      academic: { grade: '4' },
      agreements: { bypassAgeLimits: false },
      meta: { submitted: true },
      classes: [],
      enrolled: false,
    },
  }
  mockDoc.mockImplementation((path: string) => ({ path }))
  transaction = {
    get: jest.fn(async (ref: any) => snapshot(ref.path)),
    update: jest.fn(),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
})

describe('isOwnRegistration', () => {
  test("accepts the parent's own id and their numbered children", () => {
    expect(isOwnRegistration('parent-uid', 'parent-uid')).toBe(true)
    expect(isOwnRegistration('parent-uid', 'parent-uid-1')).toBe(true)
    expect(isOwnRegistration('parent-uid', 'parent-uid-12')).toBe(true)
  })

  test("refuses anyone else's, including one that only shares a prefix", () => {
    expect(isOwnRegistration('parent-uid', 'other-uid-1')).toBe(false)
    expect(isOwnRegistration('parent-uid', 'parent-uid-1-2')).toBe(false)
    expect(isOwnRegistration('parent-uid', 'parent-uid-x')).toBe(false)
    expect(isOwnRegistration('parent-uid', 'parent-uid-')).toBe(false)
    // A dash inside a uid is not a child suffix.
    expect(isOwnRegistration('parent', 'parent-uid-1')).toBe(false)
  })
})

describe('enrollStudent', () => {
  test('writes the roster and the registration together, in one transaction', async () => {
    const enrollment = await enrollStudent(PARENT, CLASS_ID, STUDENT)

    expect(mockRunTransaction).toHaveBeenCalledTimes(1)
    expect(updateTo(CLASS_PATH)).toEqual({
      students: ['someone-else', STUDENT],
    })
    expect(updateTo(REGISTRATION_PATH)).toEqual({
      classes: [CLASS_ID],
      enrolled: true,
    })
    expect(enrollment.classData.students).toEqual(['someone-else', STUDENT])
    expect(enrollment.registration).toMatchObject({
      classes: [CLASS_ID],
      enrolled: true,
      personal: { studentFirstName: 'Ada' },
    })
  })

  test("refuses another parent's student before reading anything", async () => {
    await expect(
      enrollStudent(PARENT, CLASS_ID, 'other-uid-1'),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })

  test.each([
    ['missing', undefined],
    ['unsubmitted', { meta: { submitted: false }, classes: [] }],
  ])('refuses a %s registration', async (_label, registration) => {
    if (registration) docs[REGISTRATION_PATH] = registration
    else delete docs[REGISTRATION_PATH]

    await expect(
      enrollStudent(PARENT, CLASS_ID, STUDENT),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Submit this student'),
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('refuses a class that no longer exists', async () => {
    delete docs[CLASS_PATH]

    await expect(
      enrollStudent(PARENT, CLASS_ID, STUDENT),
    ).rejects.toMatchObject({ status: 404 })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('refuses a student already on both documents', async () => {
    docs[CLASS_PATH].students = [STUDENT]
    docs[REGISTRATION_PATH].classes = [CLASS_ID]

    await expect(
      enrollStudent(PARENT, CLASS_ID, STUDENT),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/already enrolled/),
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('refuses a full class', async () => {
    docs[CLASS_PATH].students = ['a', 'b', 'c']

    await expect(
      enrollStudent(PARENT, CLASS_ID, STUDENT),
    ).rejects.toMatchObject({ status: 409, message: 'That class is full.' })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('treats a class with no classCap as full, as the page always has', async () => {
    delete docs[CLASS_PATH].classCap

    await expect(
      enrollStudent(PARENT, CLASS_ID, STUDENT),
    ).rejects.toMatchObject({ status: 409 })
  })

  test('refuses a third class', async () => {
    docs[REGISTRATION_PATH].classes = ['class-a', 'class-b']

    await expect(
      enrollStudent(PARENT, CLASS_ID, STUDENT),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Each student may only enroll in a maximum of 2 classes.',
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('refuses a student below the course minimum grade', async () => {
    docs[REGISTRATION_PATH].academic.grade = '2'

    await expect(
      enrollStudent(PARENT, CLASS_ID, STUDENT),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Students must be in grade 3 or higher to enroll in this class.',
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('lets the age-limit bypass through a grade check', async () => {
    docs[REGISTRATION_PATH].academic.grade = 'K'
    docs[REGISTRATION_PATH].agreements.bypassAgeLimits = true

    await enrollStudent(PARENT, CLASS_ID, STUDENT)

    expect(updateTo(REGISTRATION_PATH)).toEqual({
      classes: [CLASS_ID],
      enrolled: true,
    })
  })

  // What the old client writes left behind: the registration half landed and
  // the rules refused the class half.
  test('completes an enrollment only the registration recorded', async () => {
    docs[REGISTRATION_PATH].classes = [CLASS_ID, 'class-b']
    docs[REGISTRATION_PATH].enrolled = true

    await enrollStudent(PARENT, CLASS_ID, STUDENT)

    expect(updateTo(CLASS_PATH)).toEqual({
      students: ['someone-else', STUDENT],
    })
    // Already counted among its two classes, so the limit doesn't refuse it.
    expect(updateTo(REGISTRATION_PATH)).toEqual({
      classes: [CLASS_ID, 'class-b'],
      enrolled: true,
    })
  })

  test("doesn't count a seat the class already gives the student against its capacity", async () => {
    docs[CLASS_PATH].students = ['a', 'b', STUDENT]

    await enrollStudent(PARENT, CLASS_ID, STUDENT)

    expect(updateTo(CLASS_PATH)).toEqual({ students: ['a', 'b', STUDENT] })
    expect(updateTo(REGISTRATION_PATH)).toEqual({
      classes: [CLASS_ID],
      enrolled: true,
    })
  })

  test('reads both documents before writing either', async () => {
    const order: string[] = []
    transaction.get.mockImplementation(async (ref: any) => {
      order.push(`get ${ref.path}`)
      return snapshot(ref.path)
    })
    transaction.update.mockImplementation((ref: any) => {
      order.push(`update ${ref.path}`)
    })

    await enrollStudent(PARENT, CLASS_ID, STUDENT)

    expect(order).toEqual([
      `get ${CLASS_PATH}`,
      `get ${REGISTRATION_PATH}`,
      `update ${CLASS_PATH}`,
      `update ${REGISTRATION_PATH}`,
    ])
  })
})

describe('unenrollStudent', () => {
  beforeEach(() => {
    docs[CLASS_PATH].students = ['someone-else', STUDENT]
    docs[REGISTRATION_PATH].classes = [CLASS_ID, 'class-b']
    docs[REGISTRATION_PATH].enrolled = true
  })

  test('removes the student from both documents in one transaction', async () => {
    await unenrollStudent(PARENT, CLASS_ID, STUDENT)

    expect(mockRunTransaction).toHaveBeenCalledTimes(1)
    expect(updateTo(CLASS_PATH)).toEqual({ students: ['someone-else'] })
    expect(updateTo(REGISTRATION_PATH)).toEqual({
      classes: ['class-b'],
      enrolled: true,
    })
  })

  test('marks the registration unenrolled when no class is left', async () => {
    docs[REGISTRATION_PATH].classes = [CLASS_ID]

    await unenrollStudent(PARENT, CLASS_ID, STUDENT)

    expect(updateTo(REGISTRATION_PATH)).toEqual({
      classes: [],
      enrolled: false,
    })
  })

  test('clears the registration half of an enrollment the class never recorded', async () => {
    docs[CLASS_PATH].students = ['someone-else']

    await unenrollStudent(PARENT, CLASS_ID, STUDENT)

    expect(updateTo(CLASS_PATH)).toBeUndefined()
    expect(updateTo(REGISTRATION_PATH)).toEqual({
      classes: ['class-b'],
      enrolled: true,
    })
  })

  test('still clears the registration when the class has been deleted', async () => {
    delete docs[CLASS_PATH]

    await unenrollStudent(PARENT, CLASS_ID, STUDENT)

    expect(updateTo(CLASS_PATH)).toBeUndefined()
    expect(updateTo(REGISTRATION_PATH)).toEqual({
      classes: ['class-b'],
      enrolled: true,
    })
  })

  test("refuses another parent's student", async () => {
    await expect(
      unenrollStudent(PARENT, CLASS_ID, 'other-uid-1'),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })

  test('refuses a student with no registration', async () => {
    delete docs[REGISTRATION_PATH]

    await expect(
      unenrollStudent(PARENT, CLASS_ID, STUDENT),
    ).rejects.toMatchObject({ status: 404 })
    expect(transaction.update).not.toHaveBeenCalled()
  })
})
