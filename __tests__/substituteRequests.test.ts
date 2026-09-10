const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockRunTransaction = jest.fn()
const mockCanSubstitute = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
    collection: (...args: any[]) => mockCollection(...args),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
}))

jest.mock('$lib/server/instructorDirectory', () => ({
  canSubstitute: (...args: any[]) => mockCanSubstitute(...args),
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

import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import {
  classesCollection,
  substituteRequestsCollection,
} from '$lib/data/collections'
import {
  claimSubRequest,
  fetchOpenSubRequests,
  serializeSubRequest,
} from '$lib/server/substituteRequests'

/** Every document the fake Firestore holds, by path. */
let docs: Record<string, any>
let transaction: { get: jest.Mock; update: jest.Mock }
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
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
  mockCanSubstitute.mockResolvedValue(true)
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
    subInstructorEmail: 'sub@gbstem.org',
  }

  test('records the caller as the substitute and returns the claimed request', async () => {
    storeRequest()
    storeClass()

    const claimed = await claimSubRequest(SUB, REQUEST_ID)

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
