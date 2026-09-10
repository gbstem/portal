const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockGetAll = jest.fn()
const mockRunTransaction = jest.fn()
const mockIsAcceptedInstructor = jest.fn()
const mockIsAcceptedInstructorAccount = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
    collection: (...args: any[]) => mockCollection(...args),
    getAll: (...args: any[]) => mockGetAll(...args),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
}))

jest.mock('$lib/server/instructorDirectory', () => ({
  isAcceptedInstructor: (...args: any[]) => mockIsAcceptedInstructor(...args),
  isAcceptedInstructorAccount: (...args: any[]) =>
    mockIsAcceptedInstructorAccount(...args),
  NOT_AN_ACCEPTED_INSTRUCTOR: 'No accepted gbSTEM instructor has that email.',
}))

jest.mock('firebase-admin/firestore', () => ({
  FieldPath: { documentId: () => '__name__' },
  FieldValue: {
    arrayUnion: (value: string) => ({ arrayUnion: value }),
    arrayRemove: (value: string) => ({ arrayRemove: value }),
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

import { classesCollection, currentSemester } from '$lib/data/collections'
import {
  fetchInstructorClasses,
  INSTRUCTOR_CLASSES_COLLECTION,
  isOwnClassId,
  saveClassDetails,
  type ClassDetailsFields,
} from '$lib/server/instructorClasses'

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
    instructorEmail: OWNER.email,
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
  // A collection query that honours document-id range bounds, so the test
  // sees exactly what Firestore would return for them.
  mockCollection.mockImplementation((collectionPath: string) => {
    const bounds: { op: string; value: string }[] = []
    const query: { where: jest.Mock; get: () => Promise<{ docs: any[] }> } = {
      where: jest.fn((_field: string, op: string, value: string) => {
        bounds.push({ op, value })
        return query
      }),
      get: async () => ({
        docs: Object.keys(docs)
          .filter((path) => path.startsWith(`${collectionPath}/`))
          .map((path) => path.slice(collectionPath.length + 1))
          .filter((id) =>
            bounds.every(({ op, value }) =>
              op === '>=' ? id >= value : id < value,
            ),
          )
          .map((id) => snapshot(`${collectionPath}/${id}`)),
      }),
    }
    return query
  })
  mockGetAll.mockImplementation(async (...refs: { path: string }[]) =>
    refs.map((ref) => snapshot(ref.path)),
  )
  transaction = {
    get: jest.fn(async (ref: { path: string }) => snapshot(ref.path)),
    set: jest.fn(),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
  mockIsAcceptedInstructor.mockResolvedValue(true)
  mockIsAcceptedInstructorAccount.mockResolvedValue(true)
})

describe('isOwnClassId', () => {
  test('matches exactly `${uid}-${n}` with n a positive integer', () => {
    expect(isOwnClassId('uid-1-1', 'uid-1')).toBe(true)
    expect(isOwnClassId('uid-1-12', 'uid-1')).toBe(true)
    expect(isOwnClassId('uid-1', 'uid-1')).toBe(false)
    expect(isOwnClassId('uid-1-0', 'uid-1')).toBe(false)
    expect(isOwnClassId('uid-1-abc', 'uid-1')).toBe(false)
    expect(isOwnClassId('uid-1_1', 'uid-1')).toBe(false)
    expect(isOwnClassId('other-1', 'uid-1')).toBe(false)
  })

  test("doesn't let a uid own a longer hyphenated uid's classes", () => {
    expect(isOwnClassId('instructor-demo-uid-1', 'instructor')).toBe(false)
  })

  test('treats regex characters in a uid literally', () => {
    expect(isOwnClassId('a.b-1', 'a.b')).toBe(true)
    expect(isOwnClassId('axb-1', 'a.b')).toBe(false)
  })
})

describe('fetchInstructorClasses', () => {
  test('returns owned and shared classes, with session dates as ISO strings', async () => {
    docs[`${classesCollection}/uid-1-1`] = {
      course: 'Python 1',
      meetingTimes: [timestamp('2026-10-05T20:00:00.000Z')],
      completedClassDates: [timestamp('2026-10-06T20:00:00.000Z')],
    }
    docs[`${classesCollection}/shared-class`] = { course: 'Scratch 1' }
    docs[`${classesCollection}/someone-else-1`] = { course: 'Math 1' }
    docs[`${INSTRUCTOR_CLASSES_COLLECTION}/uid-1`] = {
      classIds: ['shared-class', 'deleted-class'],
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

  test('finds owned classes with a document-id range query, not a scan', async () => {
    await fetchInstructorClasses('uid-1')

    expect(mockCollection).toHaveBeenCalledWith(classesCollection)
    const query = mockCollection.mock.results[0].value
    expect(query.where).toHaveBeenCalledWith('__name__', '>=', 'uid-1-')
    expect(query.where).toHaveBeenCalledWith('__name__', '<', 'uid-1.')
  })

  test("drops another uid's classes that fall inside the caller's id range", async () => {
    docs[`${classesCollection}/instructor-demo-uid-1`] = { course: 'Python 1' }
    docs[`${classesCollection}/instructor-2`] = { course: 'Python 2' }

    const classes = await fetchInstructorClasses('instructor')

    expect(Object.keys(classes)).toEqual(['instructor-2'])
  })

  test('makes no batched read when nothing beyond their own is shared', async () => {
    docs[`${classesCollection}/uid-1-1`] = { course: 'Python 1' }
    docs[`${INSTRUCTOR_CLASSES_COLLECTION}/uid-1`] = { classIds: ['uid-1-1'] }

    const classes = await fetchInstructorClasses('uid-1')

    expect(Object.keys(classes)).toEqual(['uid-1-1'])
    expect(mockGetAll).not.toHaveBeenCalled()
  })
})

describe('saveClassDetails', () => {
  beforeEach(() => {
    docs['users/owner-uid'] = { firstName: 'Ada', lastName: 'Lovelace' }
  })

  test("creates a class under the caller's own id, owned by and listed for them", async () => {
    await saveClassDetails(OWNER, CLASS_ID, details(), schedule)

    expect(classWrite(CLASS_ID)).toEqual({
      ...details(),
      otherInstructorEmails: { delete: true },
      students: [],
      completedClassDates: [],
      ...schedule,
      instructorUid: 'owner-uid',
      instructorEmail: 'owner@gbstem.org',
      instructorFirstName: 'Ada',
      instructorLastName: 'Lovelace',
      semester: currentSemester,
    })
    expect(writesTo(`${INSTRUCTOR_CLASSES_COLLECTION}/owner-uid`)).toEqual([
      { classIds: { arrayUnion: CLASS_ID } },
    ])
    for (const [, , options] of transaction.set.mock.calls) {
      expect(options).toEqual({ merge: true })
    }
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
    expect(writesTo(`${INSTRUCTOR_CLASSES_COLLECTION}/owner-uid`)).toEqual([
      { classIds: { arrayUnion: CLASS_ID } },
    ])
    expect(writesTo(`${INSTRUCTOR_CLASSES_COLLECTION}/co-1`)).toEqual([])
  })

  test('adds and revokes mappings against the stored co-instructor list', async () => {
    storeClass({ otherInstructorUids: ['co-1', 'co-2'] })

    await saveClassDetails(
      OWNER,
      CLASS_ID,
      details({ otherInstructorUids: ['co-2', 'co-3'] }),
    )

    expect(classWrite(CLASS_ID).otherInstructorUids).toEqual(['co-2', 'co-3'])
    expect(writesTo(`${INSTRUCTOR_CLASSES_COLLECTION}/co-3`)).toEqual([
      { classIds: { arrayUnion: CLASS_ID } },
    ])
    expect(writesTo(`${INSTRUCTOR_CLASSES_COLLECTION}/co-1`)).toEqual([
      { classIds: { arrayRemove: CLASS_ID } },
    ])
    expect(writesTo(`${INSTRUCTOR_CLASSES_COLLECTION}/co-2`)).toEqual([])
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
