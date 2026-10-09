const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockRunTransaction = jest.fn()
const mockCanSubstitute = jest.fn()
const mockIsAcceptedInstructor = jest.fn()

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
    collection: (...args: any[]) => mockCollection(...args),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
}))

jest.mock('#lib/server/instructorDirectory.js', () => ({
  canSubstitute: (...args: any[]) => mockCanSubstitute(...args),
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

import { SubRequestStatus } from '#lib/components/helpers/SubRequestStatus.js'
import {
  classesCollection,
  substituteRequestsCollection,
} from '#lib/data/collections.js'
import {
  cancelSubRequest,
  claimSubRequest,
  editSubRequest,
  fetchOpenSubRequests,
  fileSubRequest,
  serializeSubRequest,
} from '#lib/server/substituteRequests.js'

/** Every document the fake Firestore holds, by path. */
let docs: Record<string, any>
let transaction: {
  get: jest.Mock
  update: jest.Mock
  set: jest.Mock
  delete: jest.Mock
}
let query: { where: jest.Mock; orderBy: jest.Mock; get: jest.Mock }

function snapshot(path: string) {
  return {
    id: path.split('/').pop(),
    exists: path in docs,
    data: () => docs[path],
  }
}

const timestamp = (iso: string) => ({ toDate: () => new Date(iso) })

const FUTURE = '2099-10-05T20:00:00.000Z'
const PAST = '2020-10-05T20:00:00.000Z'
const SUB = { uid: 'sub-uid', email: 'sub@gbstem.org' }
/**
 * A class's three scheduled sessions, each at a different time, so a request
 * dated from the wrong one shows up.
 */
const SESSION_TIMES = [
  '2099-10-01T20:00:00.000Z',
  '2099-10-03T20:00:00.000Z',
  '2099-10-08T20:00:00.000Z',
]
const REQUEST_ID = 'owner-uid-1---2'
const REQUEST_PATH = `${substituteRequestsCollection}/${REQUEST_ID}`

function storeRequest(overrides: Record<string, unknown> = {}) {
  docs[REQUEST_PATH] = {
    id: 'owner-uid-1',
    classNumber: 2,
    course: 'Python 1',
    dateOfClass: timestamp(FUTURE),
    notes: 'Loops.',
    link: 'https://zoom.us/j/1',
    originalInstructorEmail: 'owner@gbstem.org',
    originalInstructorUid: 'owner-uid',
    requestedByUid: 'owner-uid',
    subInstructorId: '',
    subInstructorFirstName: '',
    subInstructorEmail: '',
    subRequestStatus: SubRequestStatus.SubstituteNeeded,
    ...overrides,
  }
}

function storeClass() {
  docs[`${classesCollection}/owner-uid-1`] = {
    instructorUid: 'owner-uid',
    otherInstructorUids: ['co-uid'],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  docs = { 'users/sub-uid': { firstName: 'Sam' } }
  mockDoc.mockImplementation((path: string) => ({
    path,
    get: async () => snapshot(path),
  }))
  query = {
    where: jest.fn(() => query),
    orderBy: jest.fn(() => query),
    get: jest.fn(async () => ({ docs: [] })),
  }
  mockCollection.mockReturnValue(query)
  transaction = {
    get: jest.fn(async (ref: { path: string }) => snapshot(ref.path)),
    update: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
  mockCanSubstitute.mockResolvedValue(true)
  mockIsAcceptedInstructor.mockResolvedValue(true)
})

describe('fetchOpenSubRequests', () => {
  const openDoc = (id: string, data: Record<string, unknown>) => ({
    id,
    data: () => data,
  })

  test("queries unclaimed future sessions soonest first, and drops the caller's own", async () => {
    query.get.mockResolvedValue({
      docs: [
        openDoc('a-1---1', {
          course: 'Python 1',
          classNumber: 1,
          dateOfClass: timestamp(FUTURE),
          requestedByUid: 'a',
          originalInstructorUid: 'a',
          notes: 'Loops.',
          link: 'https://zoom.us/j/9',
          originalInstructorEmail: 'a@gbstem.org',
        }),
        openDoc('sub-uid-1---2', {
          course: 'Math',
          classNumber: 2,
          dateOfClass: timestamp(FUTURE),
          requestedByUid: 'sub-uid',
          originalInstructorUid: 'sub-uid',
        }),
        // Filed by a co-instructor, but for the caller's own class.
        openDoc('sub-uid-2---3', {
          course: 'Scratch',
          classNumber: 3,
          dateOfClass: timestamp(FUTURE),
          requestedByUid: 'co-uid',
          originalInstructorUid: 'sub-uid',
        }),
      ],
    })

    const open = await fetchOpenSubRequests('sub-uid')

    expect(mockCollection).toHaveBeenCalledWith(substituteRequestsCollection)
    expect(query.where).toHaveBeenCalledWith(
      'subRequestStatus',
      '==',
      SubRequestStatus.SubstituteNeeded,
    )
    expect(query.where).toHaveBeenCalledWith(
      'dateOfClass',
      '>',
      expect.any(Date),
    )
    expect(query.orderBy).toHaveBeenCalledWith('dateOfClass')
    // Only what the signup list shows: no notes, link or addresses.
    expect(open).toEqual([
      {
        id: 'a-1---1',
        course: 'Python 1',
        classNumber: 1,
        dateOfClass: FUTURE,
      },
    ])
  })

  test('refuses an instructor who is neither accepted nor a substitute', async () => {
    mockCanSubstitute.mockResolvedValue(false)

    await expect(fetchOpenSubRequests('applicant-uid')).rejects.toMatchObject({
      status: 403,
    })
    expect(query.get).not.toHaveBeenCalled()
  })
})

describe('claimSubRequest', () => {
  const claim = {
    subRequestStatus: SubRequestStatus.SubstituteFound,
    subInstructorId: 'sub-uid',
    subInstructorFirstName: 'Sam',
  }

  test('records the caller as the substitute and returns the claimed request', async () => {
    storeRequest()
    storeClass()

    const claimed = await claimSubRequest(SUB, REQUEST_ID)

    // By uid only - `claim` carries no address, so a claimed request holds
    // nothing that goes stale when the substitute changes their account email.
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: REQUEST_PATH }),
      claim,
    )
    expect(claimed).toMatchObject({
      ...claim,
      id: REQUEST_ID,
      notes: 'Loops.',
      requestedByUid: 'owner-uid',
      dateOfClass: new Date(FUTURE),
    })
  })

  test('lets a request a co-instructor filed be claimed', async () => {
    storeRequest({ requestedByUid: 'co-uid' })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).resolves.toMatchObject(claim)
  })

  test('refuses a session somebody has already claimed', async () => {
    storeRequest({
      subRequestStatus: SubRequestStatus.SubstituteFound,
      subInstructorId: 'someone-else',
    })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 409,
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test("refuses the caller's own request", async () => {
    storeRequest({ requestedByUid: 'sub-uid' })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 403,
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('refuses a request for a class the caller is the instructor of record on', async () => {
    storeRequest({ originalInstructorUid: 'sub-uid', requestedByUid: 'co-uid' })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 403,
    })
  })

  test('refuses a session that has already happened', async () => {
    storeRequest({ dateOfClass: timestamp(PAST) })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 400,
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  // Covering a session opens its roster, so a request has to come from
  // somebody who teaches the class.
  test('refuses a request not filed by an instructor of its class', async () => {
    storeRequest({
      requestedByUid: 'stranger-uid',
      originalInstructorUid: 'stranger-uid',
    })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 400,
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  // The forgery this check exists for: any signed-in account names the real
  // owner as requester and itself as instructor of record, which the rules
  // allow because one of the two is the creator.
  test('refuses a request naming a stranger as instructor of record', async () => {
    storeRequest({
      requestedByUid: 'owner-uid',
      originalInstructorUid: 'stranger-uid',
    })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 400,
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('refuses a request naming a co-instructor as instructor of record', async () => {
    storeRequest({
      requestedByUid: 'co-uid',
      originalInstructorUid: 'co-uid',
    })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 400,
    })
  })

  test('refuses a request with no instructor of record', async () => {
    storeRequest({ originalInstructorUid: undefined })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 400,
    })
  })

  test('refuses a request whose requester does not teach the class', async () => {
    storeRequest({ requestedByUid: 'stranger-uid' })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 400,
    })
  })

  test('accepts a request written before requestedByUid existed', async () => {
    storeRequest({ requestedByUid: undefined })
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).resolves.toMatchObject(claim)
  })

  test('takes the instructor of record from the class id when the class predates instructorUid', async () => {
    storeRequest()
    docs[`${classesCollection}/owner-uid-1`] = { otherInstructorUids: [] }

    await expect(claimSubRequest(SUB, REQUEST_ID)).resolves.toMatchObject(claim)
  })

  test('refuses a request whose class no longer exists', async () => {
    storeRequest()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 400,
    })
  })

  test('404s a request that no longer exists', async () => {
    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 404,
    })
  })

  test('refuses an instructor who is neither accepted nor a substitute', async () => {
    mockCanSubstitute.mockResolvedValue(false)
    storeRequest()
    storeClass()

    await expect(claimSubRequest(SUB, REQUEST_ID)).rejects.toMatchObject({
      status: 403,
    })
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })
})

describe('serializeSubRequest', () => {
  test('sends the session date as an ISO string', () => {
    expect(
      serializeSubRequest({
        id: REQUEST_ID,
        dateOfClass: new Date(FUTURE),
      } as Data.SubRequest).dateOfClass,
    ).toBe(FUTURE)
  })
})

describe("fileSubRequest - the class instructor's side", () => {
  const CLASS_PATH = `${classesCollection}/owner-uid-1`
  const input = {
    classNumber: 2,
    notes: 'Loops.',
  }

  beforeEach(() => {
    docs[CLASS_PATH] = {
      course: 'Python 1',
      meetingLink: 'https://zoom.us/j/1',
      instructorUid: 'owner-uid',
      otherInstructorUids: ['co-uid'],
      meetingTimes: SESSION_TIMES.map(timestamp),
    }
  })

  const written = () => transaction.set.mock.calls[0]

  test("names the class's instructor of record and the co-instructor asking, from the class", async () => {
    await expect(
      fileSubRequest({ uid: 'co-uid' }, 'owner-uid-1', input),
    ).resolves.toBe(REQUEST_ID)

    const [ref, data] = written()
    expect(ref.path).toBe(REQUEST_PATH)
    expect(data).toEqual(
      expect.objectContaining({
        id: 'owner-uid-1',
        classNumber: 2,
        course: 'Python 1',
        link: 'https://zoom.us/j/1',
        originalInstructorUid: 'owner-uid',
        requestedByUid: 'co-uid',
        subInstructorId: '',
        subRequestStatus: SubRequestStatus.SubstituteNeeded,
      }),
    )
  })

  test("dates the request from the session's scheduled time", async () => {
    await fileSubRequest({ uid: 'owner-uid' }, 'owner-uid-1', input)

    const [, data] = written()
    expect(data.dateOfClass).toEqual(new Date(SESSION_TIMES[1]))
  })

  test('refuses an instructor who has not been accepted', async () => {
    mockIsAcceptedInstructor.mockResolvedValue(false)
    await expect(
      fileSubRequest({ uid: 'owner-uid' }, 'owner-uid-1', input),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })

  test("refuses someone who doesn't teach the class", async () => {
    await expect(
      fileSubRequest({ uid: 'sub-uid' }, 'owner-uid-1', input),
    ).rejects.toMatchObject({ status: 403 })
    expect(transaction.set).not.toHaveBeenCalled()
  })

  test('refuses a session that is not on the schedule', async () => {
    for (const classNumber of [0, 4]) {
      await expect(
        fileSubRequest({ uid: 'owner-uid' }, 'owner-uid-1', {
          ...input,
          classNumber,
        }),
      ).rejects.toMatchObject({ status: 400 })
    }
    expect(transaction.set).not.toHaveBeenCalled()
  })

  // Whoever may already be covering it would be written over.
  test('refuses a session that already has a request', async () => {
    storeRequest({ subInstructorId: 'sub-uid' })
    await expect(
      fileSubRequest({ uid: 'owner-uid' }, 'owner-uid-1', input),
    ).rejects.toMatchObject({
      status: 409,
      message:
        "That session already has a sub request, so it wasn't filed again.",
    })
    expect(transaction.set).not.toHaveBeenCalled()
  })
})

describe('editSubRequest and cancelSubRequest', () => {
  const edit = {
    classNumber: 2,
    notes: 'Recursion instead.',
  }

  beforeEach(() => {
    docs[`${classesCollection}/owner-uid-1`] = {
      instructorUid: 'owner-uid',
      meetingTimes: SESSION_TIMES.map(timestamp),
    }
  })

  test('changes only the notes, and re-reads the date from the schedule, when the session stays put', async () => {
    storeRequest({ requestedByUid: 'co-uid' })

    await expect(
      editSubRequest({ uid: 'co-uid' }, REQUEST_ID, edit),
    ).resolves.toBe(REQUEST_ID)

    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: REQUEST_PATH }),
      { dateOfClass: new Date(SESSION_TIMES[1]), notes: edit.notes },
    )
    expect(transaction.set).not.toHaveBeenCalled()
    expect(transaction.delete).not.toHaveBeenCalled()
  })

  test('moves the request to another session in the same transaction', async () => {
    storeRequest()

    await expect(
      editSubRequest({ uid: 'owner-uid' }, REQUEST_ID, {
        ...edit,
        classNumber: 3,
      }),
    ).resolves.toBe('owner-uid-1---3')

    const [ref, data] = transaction.set.mock.calls[0]
    expect(ref.path).toBe(`${substituteRequestsCollection}/owner-uid-1---3`)
    expect(data).toEqual(
      expect.objectContaining({
        id: 'owner-uid-1',
        classNumber: 3,
        // The new session's time, not the one it was filed for.
        dateOfClass: new Date(SESSION_TIMES[2]),
        notes: edit.notes,
        originalInstructorUid: 'owner-uid',
      }),
    )
    expect(transaction.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: REQUEST_PATH }),
    )
  })

  test('refuses moving onto a session that already has a request', async () => {
    storeRequest()
    docs[`${substituteRequestsCollection}/owner-uid-1---3`] = { classNumber: 3 }

    await expect(
      editSubRequest({ uid: 'owner-uid' }, REQUEST_ID, {
        ...edit,
        classNumber: 3,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(transaction.delete).not.toHaveBeenCalled()
  })

  test('refuses moving a request somebody has signed up to cover', async () => {
    storeRequest({
      subInstructorId: 'sub-uid',
      subRequestStatus: SubRequestStatus.SubstituteFound,
    })

    await expect(
      editSubRequest({ uid: 'owner-uid' }, REQUEST_ID, {
        ...edit,
        classNumber: 3,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(transaction.set).not.toHaveBeenCalled()
  })

  test('refuses the substitute, and anyone else who neither filed it nor owns the class', async () => {
    storeRequest({ subInstructorId: 'sub-uid' })

    for (const uid of ['sub-uid', 'co-uid']) {
      await expect(
        editSubRequest({ uid }, REQUEST_ID, edit),
      ).rejects.toMatchObject({ status: 403 })
      await expect(cancelSubRequest({ uid }, REQUEST_ID)).rejects.toMatchObject(
        { status: 403 },
      )
    }
    expect(transaction.update).not.toHaveBeenCalled()
    expect(transaction.delete).not.toHaveBeenCalled()
  })

  test("cancels one of the caller's own requests, and 404s one that is gone", async () => {
    storeRequest()

    await cancelSubRequest({ uid: 'owner-uid' }, REQUEST_ID)
    expect(transaction.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: REQUEST_PATH }),
    )

    await expect(
      cancelSubRequest({ uid: 'owner-uid' }, 'owner-uid-1---9'),
    ).rejects.toMatchObject({ status: 404 })
  })
})
