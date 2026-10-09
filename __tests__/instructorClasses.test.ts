const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockRunTransaction = jest.fn()
const mockIsAcceptedInstructor = jest.fn()
const mockIsAcceptedInstructorAccount = jest.fn()

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
    collection: (...args: any[]) => mockCollection(...args),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
}))

jest.mock('#lib/server/instructorDirectory.js', () => ({
  isAcceptedInstructor: (...args: any[]) => mockIsAcceptedInstructor(...args),
  isAcceptedInstructorAccount: (...args: any[]) =>
    mockIsAcceptedInstructorAccount(...args),
  NOT_AN_ACCEPTED_INSTRUCTOR: 'No accepted gbSTEM instructor has that email.',
}))

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    delete: () => ({ delete: true }),
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

import { classesCollection, currentSemester } from '#lib/data/collections.js'
import {
  fetchInstructorClasses,
  saveClassDetails,
  type ClassDetailsFields,
} from '#lib/server/instructorClasses.js'

/** Every document the fake Firestore holds, by path. */
let docs: Record<string, any>
let transaction: { get: jest.Mock; set: jest.Mock }

function snapshot(path: string) {
  return {
    id: path.split('/').pop(),
    exists: path in docs,
    data: () => docs[path],
  }
}

const timestamp = (iso: string) => ({ toDate: () => new Date(iso) })

/** The data of every transactional write to `path`, in order. */
function writesTo(path: string) {
  return transaction.set.mock.calls
    .filter(([ref]) => ref.path === path)
    .map(([, data]) => data)
}

function classWrite(classId: string) {
  const [data] = writesTo(`${classesCollection}/${classId}`)
  return data
}

const OWNER = { uid: 'owner-uid', email: 'owner@gbstem.org' }
const CLASS_ID = 'owner-uid-1'

function details(overrides: Partial<ClassDetailsFields> = {}) {
  return {
    course: 'Python 1',
    gradeRecommendation: '6-8',
    classCap: 7,
    meetingLink: 'https://zoom.us/j/1',
    classDay1: 'Monday',
    classTime1: '16:00',
    classDay2: '',
    classTime2: '',
    online: true,
    otherInstructorUids: [],
    ...overrides,
  } as ClassDetailsFields
}

const schedule = {
  meetingTimes: [new Date('2026-10-05T20:00:00.000Z')],
  feedbackCompleted: [false],
  classStatuses: ['ClassInFuture'],
}

function storeClass(overrides: Record<string, unknown> = {}) {
  docs[`${classesCollection}/${CLASS_ID}`] = {
    course: 'Python 1',
    classDay1: 'Monday',
    classTime1: '16:00',
    classDay2: '',
    classTime2: '',
    instructorUid: OWNER.uid,
    instructorFirstName: 'Ada',
    instructorLastName: 'Lovelace',
    otherInstructorUids: [],
    meetingTimes: [timestamp('2026-10-05T20:00:00.000Z')],
    completedClassDates: [],
    students: ['student-1'],
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  docs = {}
  mockDoc.mockImplementation((path: string) => ({
    path,
    get: async () => snapshot(path),
  }))
  // A collection query that honours `==` and `array-contains`, so the test
  // sees exactly what Firestore would return.
  mockCollection.mockImplementation((collectionPath: string) => {
    const query = (
      filters: { field: string; op: string; value: string }[],
    ): { where: jest.Mock; get: () => Promise<{ docs: any[] }> } => ({
      where: jest.fn((field: string, op: string, value: string) =>
        query([...filters, { field, op, value }]),
      ),
      get: async () => ({
        docs: Object.keys(docs)
          .filter((path) => path.startsWith(`${collectionPath}/`))
          .filter((path) =>
            filters.every(({ field, op, value }) => {
              const stored = docs[path][field]
              return op === 'array-contains'
                ? Array.isArray(stored) && stored.includes(value)
                : stored === value
            }),
          )
          .map((path) => snapshot(path)),
      }),
    })
    return query([])
  })
  transaction = {
    get: jest.fn(async (ref: { path: string }) => snapshot(ref.path)),
    set: jest.fn(),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
  mockIsAcceptedInstructor.mockResolvedValue(true)
  mockIsAcceptedInstructorAccount.mockResolvedValue(true)
})

describe('fetchInstructorClasses', () => {
  test('returns owned and shared classes, with session dates as ISO strings', async () => {
    docs[`${classesCollection}/uid-1-1`] = {
      course: 'Python 1',
      instructorUid: 'uid-1',
      meetingTimes: [timestamp('2026-10-05T20:00:00.000Z')],
      completedClassDates: [timestamp('2026-10-06T20:00:00.000Z')],
    }
    docs[`${classesCollection}/shared-class`] = {
      course: 'Scratch 1',
      instructorUid: 'uid-2',
      otherInstructorUids: ['uid-1'],
    }
    docs[`${classesCollection}/someone-else-1`] = {
      course: 'Math 1',
      instructorUid: 'uid-2',
      otherInstructorUids: ['uid-3'],
    }

    const classes = await fetchInstructorClasses('uid-1')

    expect(Object.keys(classes).sort()).toEqual(['shared-class', 'uid-1-1'])
    expect(classes['uid-1-1'].meetingTimes).toEqual([
      '2026-10-05T20:00:00.000Z',
    ])
    expect(classes['uid-1-1'].completedClassDates).toEqual([
      '2026-10-06T20:00:00.000Z',
    ])
    expect(classes['shared-class'].meetingTimes).toEqual([])
  })

  test('finds an owned class by instructorUid, whatever its id', async () => {
    docs[`${classesCollection}/class-python1`] = {
      course: 'Python 1',
      instructorUid: 'uid-1',
    }

    const classes = await fetchInstructorClasses('uid-1')

    expect(Object.keys(classes)).toEqual(['class-python1'])
  })

  test("leaves out a class under the caller's id prefix that names someone else", async () => {
    docs[`${classesCollection}/uid-1-1`] = {
      course: 'Python 1',
      instructorUid: 'uid-2',
    }

    const classes = await fetchInstructorClasses('uid-1')

    expect(classes).toEqual({})
  })

  test("leaves out a class once they're taken off its co-instructors", async () => {
    docs[`${classesCollection}/owner-1`] = {
      course: 'Python 1',
      instructorUid: 'owner',
      otherInstructorUids: ['uid-2'],
    }

    const classes = await fetchInstructorClasses('uid-1')

    expect(classes).toEqual({})
  })
})

describe('saveClassDetails', () => {
  beforeEach(() => {
    docs['users/owner-uid'] = { firstName: 'Ada', lastName: 'Lovelace' }
  })

  test("creates a class under the caller's own id, owned by them", async () => {
    await saveClassDetails(OWNER, CLASS_ID, details(), schedule)

    expect(classWrite(CLASS_ID)).toEqual({
      ...details(),
      otherInstructorEmails: { delete: true },
      students: [],
      completedClassDates: [],
      ...schedule,
      instructorUid: 'owner-uid',
      instructorFirstName: 'Ada',
      instructorLastName: 'Lovelace',
      semester: currentSemester,
    })
    expect(transaction.set).toHaveBeenCalledTimes(1)
    expect(transaction.set.mock.calls[0][2]).toEqual({ merge: true })
  })

  test("refuses creating a class under anyone else's id", async () => {
    await expect(
      saveClassDetails(OWNER, 'co-1-1', details(), schedule),
    ).rejects.toMatchObject({ status: 403 })
    expect(transaction.set).not.toHaveBeenCalled()
  })

  test('refuses a caller who is not an accepted instructor', async () => {
    mockIsAcceptedInstructor.mockResolvedValue(false)

    await expect(
      saveClassDetails(OWNER, CLASS_ID, details(), schedule),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })

  test("refuses an instructor who doesn't teach the existing class", async () => {
    storeClass()

    await expect(
      saveClassDetails(
        { uid: 'stranger', email: 'stranger@gbstem.org' },
        CLASS_ID,
        details(),
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: 'You are not an instructor of that class.',
    })
    expect(transaction.set).not.toHaveBeenCalled()
  })

  test("a co-instructor's save changes the class but not who owns it", async () => {
    storeClass({ otherInstructorUids: ['co-1'] })

    await saveClassDetails(
      { uid: 'co-1', email: 'co@gbstem.org' },
      CLASS_ID,
      details({ classCap: 9, otherInstructorUids: ['co-1'] }),
    )

    const written = classWrite(CLASS_ID)
    expect(written.classCap).toBe(9)
    expect(written).not.toHaveProperty('instructorUid')
    expect(written).not.toHaveProperty('instructorEmail')
  })

  test('checks only the co-instructors added since the stored list', async () => {
    storeClass({ otherInstructorUids: ['co-1', 'co-2'] })

    await saveClassDetails(
      OWNER,
      CLASS_ID,
      details({ otherInstructorUids: ['co-2', 'co-3'] }),
    )

    expect(classWrite(CLASS_ID).otherInstructorUids).toEqual(['co-2', 'co-3'])
    expect(mockIsAcceptedInstructorAccount).toHaveBeenCalledTimes(1)
    expect(mockIsAcceptedInstructorAccount).toHaveBeenCalledWith('co-3')
  })

  test('refuses adding a co-instructor who is not an accepted instructor', async () => {
    storeClass()
    mockIsAcceptedInstructorAccount.mockResolvedValue(false)

    await expect(
      saveClassDetails(
        OWNER,
        CLASS_ID,
        details({ otherInstructorUids: ['rejected-uid'] }),
      ),
    ).rejects.toMatchObject({ status: 400 })
    expect(transaction.set).not.toHaveBeenCalled()
  })

  // Surfaced to the owner in the form for a deliberate removal, not revoked
  // silently on their next save.
  test('keeps an existing co-instructor who has since lost acceptance', async () => {
    storeClass({ otherInstructorUids: ['co-1'] })
    mockIsAcceptedInstructorAccount.mockResolvedValue(false)

    await saveClassDetails(
      OWNER,
      CLASS_ID,
      details({ otherInstructorUids: ['co-1'] }),
    )

    expect(classWrite(CLASS_ID).otherInstructorUids).toEqual(['co-1'])
    expect(mockIsAcceptedInstructorAccount).not.toHaveBeenCalled()
  })

  test('never lists the owner as their own co-instructor', async () => {
    storeClass()

    await saveClassDetails(
      OWNER,
      CLASS_ID,
      details({ otherInstructorUids: ['owner-uid', 'owner-uid'] }),
    )

    expect(classWrite(CLASS_ID).otherInstructorUids).toEqual([])
    expect(mockIsAcceptedInstructorAccount).not.toHaveBeenCalled()
  })

  test('refuses new class days or times without a rebuilt schedule', async () => {
    storeClass()

    await expect(
      saveClassDetails(OWNER, CLASS_ID, details({ classDay1: 'Tuesday' })),
    ).rejects.toMatchObject({ status: 400 })
    expect(transaction.set).not.toHaveBeenCalled()
  })

  test('refuses a first save with no schedule at all', async () => {
    await expect(
      saveClassDetails(OWNER, CLASS_ID, details()),
    ).rejects.toMatchObject({ status: 400 })
  })

  test('leaves the schedule, roster and completed sessions of an existing class alone', async () => {
    storeClass()

    await saveClassDetails(OWNER, CLASS_ID, details({ classCap: 12 }))

    const written = classWrite(CLASS_ID)
    expect(written.classCap).toBe(12)
    for (const field of [
      'meetingTimes',
      'feedbackCompleted',
      'classStatuses',
      'students',
      'completedClassDates',
    ]) {
      expect(written).not.toHaveProperty(field)
    }
  })

  test('writes a rebuilt schedule onto an existing class', async () => {
    storeClass()

    await saveClassDetails(
      OWNER,
      CLASS_ID,
      details({ classDay1: 'Tuesday' }),
      schedule,
    )

    expect(classWrite(CLASS_ID)).toMatchObject({
      classDay1: 'Tuesday',
      ...schedule,
    })
  })
})
