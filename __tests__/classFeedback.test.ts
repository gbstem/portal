const mockDoc = jest.fn()
const mockRunTransaction = jest.fn()
const mockIsAcceptedInstructor = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
}))

jest.mock('$lib/server/instructorDirectory', () => ({
  isAcceptedInstructor: (...args: any[]) => mockIsAcceptedInstructor(...args),
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
  currentSemester,
  instructorFeedbackCollection,
  registrationsCollection,
  studentFeedbackCollection,
} from '$lib/data/collections'
import {
  fileInstructorFeedback,
  fileStudentFeedback,
  type InstructorFeedback,
  type StudentFeedback,
} from '$lib/server/classFeedback'

const NOW = 1_780_000_000_000
const CLASS_ID = 'owner-uid-1'
const CLASS_PATH = `${classesCollection}/${CLASS_ID}`

/** Every document the fake Firestore holds, by path. */
let docs: Record<string, any>
let transaction: { get: jest.Mock; set: jest.Mock; update: jest.Mock }
/** Reads and writes in the order the transaction made them. */
let calls: string[]

function snapshot(path: string) {
  return { exists: path in docs, data: () => docs[path] }
}

/** Whatever the transaction set at `path`, or undefined if it set nothing. */
function setAt(path: string) {
  return transaction.set.mock.calls.find(([ref]) => ref.path === path)?.[1]
}

function updateTo(path: string) {
  return transaction.update.mock.calls.find(([ref]) => ref.path === path)?.[1]
}

function expectNothingWritten() {
  expect(transaction.set).not.toHaveBeenCalled()
  expect(transaction.update).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(NOW)
  calls = []
  docs = {
    [CLASS_PATH]: {
      course: 'Python 1',
      instructorUid: 'owner-uid',
      instructorFirstName: 'Grace',
      instructorLastName: 'Hopper',
      otherInstructorUids: ['co-uid'],
      students: ['parent-uid-1', 'someone-else'],
      feedbackCompleted: [true, false, false],
      classStatuses: [
        'EverythingComplete',
        'FeedbackIncomplete',
        'ClassInFuture',
      ],
    },
    'users/owner-uid': { firstName: 'Grace', lastName: 'Hopper' },
    'users/co-uid': { firstName: 'Alan', lastName: 'Turing' },
    [`${registrationsCollection}/parent-uid-1`]: {
      personal: { studentFirstName: 'Ada', studentLastName: 'Lovelace' },
      classes: [CLASS_ID],
    },
  }
  mockDoc.mockImplementation((path: string) => ({ path }))
  transaction = {
    get: jest.fn(async (ref: { path: string }) => {
      calls.push(`get ${ref.path}`)
      return snapshot(ref.path)
    }),
    set: jest.fn((ref: { path: string }) => calls.push(`set ${ref.path}`)),
    update: jest.fn((ref: { path: string }) =>
      calls.push(`update ${ref.path}`),
    ),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
  mockIsAcceptedInstructor.mockResolvedValue(true)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('fileInstructorFeedback', () => {
  const OWNER = { uid: 'owner-uid' }
  const FEEDBACK_PATH = `${instructorFeedbackCollection}/${CLASS_ID}-${NOW}`
  const feedback = (
    overrides: Partial<InstructorFeedback> = {},
  ): InstructorFeedback => ({
    classId: CLASS_ID,
    date: '2026-10-02',
    feedback: 'Covered lists and loops.',
    attendanceList: { 'Ada Lovelace': { present: true } },
    classNumber: 2,
    ...overrides,
  })

  test('saves the feedback and completes that session on the class, returning its id', async () => {
    await expect(fileInstructorFeedback(OWNER, feedback())).resolves.toBe(
      `${CLASS_ID}-${NOW}`,
    )

    expect(mockRunTransaction).toHaveBeenCalledTimes(1)
    expect(setAt(FEEDBACK_PATH)).toEqual({
      semester: currentSemester,
      date: '2026-10-02',
      feedback: 'Covered lists and loops.',
      attendanceList: { 'Ada Lovelace': { present: true } },
      classNumber: 2,
      // Read from the class and the caller's profile, not the browser.
      courseName: 'Python 1',
      instructorName: 'Grace Hopper',
    })
    // Only week 2 changes; weeks 1 and 3 are kept as the class has them.
    expect(updateTo(CLASS_PATH)).toEqual({
      feedbackCompleted: [true, true, false],
      classStatuses: [
        'EverythingComplete',
        'EverythingComplete',
        'ClassInFuture',
      ],
    })
  })

  test('reads the class and the profile inside the transaction before writing', async () => {
    await fileInstructorFeedback(OWNER, feedback())

    expect(calls).toEqual([
      `get ${CLASS_PATH}`,
      'get users/owner-uid',
      `set ${FEEDBACK_PATH}`,
      `update ${CLASS_PATH}`,
    ])
  })

  test('lets a co-instructor file, under their own name', async () => {
    await fileInstructorFeedback({ uid: 'co-uid' }, feedback())

    expect(mockIsAcceptedInstructor).toHaveBeenCalledWith('co-uid')
    expect(setAt(FEEDBACK_PATH).instructorName).toBe('Alan Turing')
    expect(updateTo(CLASS_PATH)).toBeDefined()
  })

  test('refuses an instructor who has not been accepted, before reading the class', async () => {
    mockIsAcceptedInstructor.mockResolvedValue(false)

    await expect(
      fileInstructorFeedback(OWNER, feedback()),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Only accepted instructors can file class feedback.',
    })
    expect(mockIsAcceptedInstructor).toHaveBeenCalledWith('owner-uid')
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })

  test("refuses an accepted instructor who doesn't teach the class", async () => {
    await expect(
      fileInstructorFeedback({ uid: 'stranger-uid' }, feedback()),
    ).rejects.toMatchObject({
      status: 403,
      message: 'You are not an instructor of that class.',
    })
    expectNothingWritten()
  })

  test('refuses a caller whose uid only shares a prefix with the owner', async () => {
    await expect(
      fileInstructorFeedback({ uid: 'owner' }, feedback()),
    ).rejects.toMatchObject({ status: 403 })
    expectNothingWritten()
  })

  test('refuses everyone on a class with no instructor uids at all', async () => {
    docs[CLASS_PATH] = {
      ...docs[CLASS_PATH],
      instructorUid: undefined,
      otherInstructorUids: undefined,
    }

    await expect(
      fileInstructorFeedback(OWNER, feedback()),
    ).rejects.toMatchObject({ status: 403 })
    expectNothingWritten()
  })

  test('refuses a class that no longer exists', async () => {
    delete docs[CLASS_PATH]

    await expect(
      fileInstructorFeedback(OWNER, feedback()),
    ).rejects.toMatchObject({
      status: 404,
      message: 'That class no longer exists.',
    })
    expectNothingWritten()
  })

  test.each([
    ['past the end of the schedule', 4],
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
  ])('refuses a session number %s, writing nothing', async (_label, n) => {
    await expect(
      fileInstructorFeedback(OWNER, feedback({ classNumber: n })),
    ).rejects.toMatchObject({
      status: 400,
      message: 'That class session is not on the schedule.',
    })
    expectNothingWritten()
  })

  test('refuses any session on a class with no schedule yet', async () => {
    docs[CLASS_PATH] = {
      ...docs[CLASS_PATH],
      feedbackCompleted: undefined,
      classStatuses: undefined,
    }

    await expect(
      fileInstructorFeedback(OWNER, feedback({ classNumber: 1 })),
    ).rejects.toMatchObject({ status: 400 })
    expectNothingWritten()
  })

  test('stores empty names rather than failing when they are missing', async () => {
    delete docs['users/owner-uid']
    docs[CLASS_PATH] = { ...docs[CLASS_PATH], course: undefined }

    await fileInstructorFeedback(OWNER, feedback())

    expect(setAt(FEEDBACK_PATH)).toMatchObject({
      courseName: '',
      instructorName: '',
    })
  })

  test('propagates a failed transaction', async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error('aborted'))

    await expect(fileInstructorFeedback(OWNER, feedback())).rejects.toThrow(
      'aborted',
    )
  })
})

describe('fileStudentFeedback', () => {
  const PARENT = { uid: 'parent-uid' }
  const STUDENT = 'parent-uid-1'
  const REGISTRATION_PATH = `${registrationsCollection}/${STUDENT}`
  const FEEDBACK_PATH = `${studentFeedbackCollection}/${CLASS_ID}-${NOW}`
  const feedback = (
    overrides: Partial<StudentFeedback> = {},
  ): StudentFeedback => ({
    studentId: STUDENT,
    classId: CLASS_ID,
    date: '2026-10-02',
    rating: 5,
    feedback: 'Loved it!',
    ...overrides,
  })

  test("saves the feedback for the parent's student in that class, returning its id", async () => {
    await expect(fileStudentFeedback(PARENT, feedback())).resolves.toBe(
      `${CLASS_ID}-${NOW}`,
    )

    expect(setAt(FEEDBACK_PATH)).toEqual({
      semester: currentSemester,
      studentId: STUDENT,
      classId: CLASS_ID,
      date: '2026-10-02',
      rating: 5,
      feedback: 'Loved it!',
      // Read from the registration and the class, not the browser.
      studentName: 'Ada Lovelace',
      course: 'Python 1',
      instructor: 'Grace Hopper',
    })
    // Feedback never touches the class or the registration.
    expect(transaction.update).not.toHaveBeenCalled()
    expect(transaction.set).toHaveBeenCalledTimes(1)
  })

  test('checks the roster inside the transaction the feedback is saved in', async () => {
    await fileStudentFeedback(PARENT, feedback())

    expect(calls).toEqual([
      `get ${CLASS_PATH}`,
      `get ${REGISTRATION_PATH}`,
      `set ${FEEDBACK_PATH}`,
    ])
  })

  test("accepts the parent account's own registration", async () => {
    docs[`${registrationsCollection}/parent-uid`] = {
      personal: { studentFirstName: 'Solo', studentLastName: 'Kid' },
    }
    docs[CLASS_PATH].students.push('parent-uid')

    await fileStudentFeedback(PARENT, feedback({ studentId: 'parent-uid' }))

    expect(setAt(FEEDBACK_PATH).studentName).toBe('Solo Kid')
  })

  test.each([
    ["another parent's student", 'other-uid-1'],
    ['a uid that only shares a prefix', 'parent-uid-1-2'],
    ['a non-numeric child suffix', 'parent-uid-x'],
  ])('refuses %s without opening a transaction', async (_label, studentId) => {
    docs[CLASS_PATH].students.push(studentId)

    await expect(
      fileStudentFeedback(PARENT, feedback({ studentId })),
    ).rejects.toMatchObject({
      status: 403,
      message: 'You can only send feedback for your own students.',
    })
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })

  test("refuses a student who isn't on the class roster, even if their registration lists it", async () => {
    docs[CLASS_PATH].students = ['someone-else']

    await expect(fileStudentFeedback(PARENT, feedback())).rejects.toMatchObject(
      {
        status: 403,
        message: 'That student is not enrolled in that class.',
      },
    )
    expectNothingWritten()
  })

  test('refuses a class with no roster', async () => {
    docs[CLASS_PATH] = { ...docs[CLASS_PATH], students: undefined }

    await expect(fileStudentFeedback(PARENT, feedback())).rejects.toMatchObject(
      { status: 403 },
    )
    expectNothingWritten()
  })

  test('refuses a student with no registration', async () => {
    delete docs[REGISTRATION_PATH]

    await expect(fileStudentFeedback(PARENT, feedback())).rejects.toMatchObject(
      {
        status: 404,
        message: 'That student has no registration.',
      },
    )
    expectNothingWritten()
  })

  test('refuses a class that no longer exists', async () => {
    delete docs[CLASS_PATH]

    await expect(fileStudentFeedback(PARENT, feedback())).rejects.toMatchObject(
      {
        status: 404,
        message: 'That class no longer exists.',
      },
    )
    expectNothingWritten()
  })

  test('stores empty names rather than failing when they are missing', async () => {
    docs[REGISTRATION_PATH] = {}
    docs[CLASS_PATH] = {
      students: [STUDENT],
    }

    await fileStudentFeedback(PARENT, feedback())

    expect(setAt(FEEDBACK_PATH)).toMatchObject({
      studentName: '',
      course: '',
      instructor: '',
    })
  })

  test('propagates a failed transaction', async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error('aborted'))

    await expect(fileStudentFeedback(PARENT, feedback())).rejects.toThrow(
      'aborted',
    )
  })
})
