const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockRunTransaction = jest.fn()
let mockDev = false

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
    collection: (...args: any[]) => mockCollection(...args),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
}))

jest.mock('$app/environment', () => ({
  get dev() {
    return mockDev
  },
}))

// Anchored to now, so the tests hold whenever they run.
jest.mock('$lib/data/collections', () => ({
  ...jest.requireActual('$lib/data/collections'),
  semesterDates: {
    returningInstructorAppsOpen: new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    instructorOrientation: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
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
  applicationsCollection,
  interviewCollection,
} from '$lib/data/collections'
import {
  bookInterviewSlot,
  fetchInterviewData,
} from '$lib/server/interviewSlots'

type Filter = [field: string, op: string, value: unknown]

/** Every document the fake Firestore holds, by path. */
let docs: Record<string, any>
let transaction: { get: jest.Mock; update: jest.Mock }
/** Every query `.get()` ran, by its filters, for asserting on. */
let ranQueries: { filters: Filter[]; orderBy?: string }[]

const at = (offsetMs: number) => new Date(Date.now() + offsetMs)
const timestamp = (date: Date) => ({ toDate: () => date })
const comparable = (value: any) =>
  value?.toDate
    ? value.toDate().getTime()
    : value instanceof Date
      ? value.getTime()
      : value

function snapshot(path: string) {
  return {
    id: path.split('/').pop(),
    exists: path in docs,
    data: () => docs[path],
  }
}

/** A collection query that honours ==, > and < filters and one ascending orderBy. */
function makeQuery(
  collectionPath: string,
  filters: Filter[] = [],
  orderBy?: string,
): any {
  return {
    where: (field: string, op: string, value: unknown) =>
      makeQuery(collectionPath, [...filters, [field, op, value]], orderBy),
    orderBy: (field: string) => makeQuery(collectionPath, filters, field),
    get: async () => {
      ranQueries.push({ filters, orderBy })
      const matching = Object.keys(docs)
        .filter((path) => path.startsWith(`${collectionPath}/`))
        .map((path) => snapshot(path))
        .filter((snap) =>
          filters.every(([field, op, value]) => {
            const actual = comparable(snap.data()[field])
            const expected = comparable(value)
            if (op === '==') return actual === expected
            if (op === '>') return actual > expected
            return actual < expected
          }),
        )
      if (orderBy) {
        matching.sort(
          (a, b) =>
            comparable(a.data()[orderBy]) - comparable(b.data()[orderBy]),
        )
      }
      return { docs: matching }
    },
  }
}

function slot(id: string, overrides: Record<string, unknown> = {}) {
  docs[`${interviewCollection}/${id}`] = {
    date: timestamp(at(2 * DAY)),
    interviewerName: 'Demo Admin',
    interviewerEmail: 'demo@gbstem.org',
    interviewerUid: 'admin-uid',
    interviewSlotStatus: 'available',
    meetingLink: `https://zoom.us/j/${id}`,
    intervieweeFirstName: '',
    intervieweeLastName: '',
    intervieweeEmail: '',
    intervieweeId: '',
    ...overrides,
  }
}

const APPLICANT = { uid: 'uid-1', email: 'grace@example.com' }

beforeEach(() => {
  jest.clearAllMocks()
  mockDev = false
  ranQueries = []
  docs = {
    'users/uid-1': { firstName: 'Grace', lastName: 'Hopper' },
    [`${applicationsCollection}/uid-1`]: { meta: { submitted: true } },
  }
  mockDoc.mockImplementation((path: string) => ({
    path,
    get: async () => snapshot(path),
  }))
  mockCollection.mockImplementation((path: string) => makeQuery(path))
  transaction = {
    get: jest.fn(async (target: any) =>
      'path' in target ? snapshot(target.path) : target.get(),
    ),
    update: jest.fn(),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
})

describe('fetchInterviewData', () => {
  test('lists bookable slots soonest first, with only what the list shows', async () => {
    slot('slot-later', { date: timestamp(at(2 * DAY)) })
    slot('slot-soon', { date: timestamp(at(5 * HOUR)) })
    slot('slot-too-soon', { date: timestamp(at(1 * HOUR)) })
    slot('slot-booked', {
      date: timestamp(at(DAY)),
      interviewSlotStatus: 'pending',
      intervieweeId: 'someone-else',
    })
    slot('slot-after-orientation', { date: timestamp(at(60 * DAY)) })

    const { availableSlots, scheduledInterview } =
      await fetchInterviewData('uid-1')

    expect(availableSlots.map((one) => one.id)).toEqual([
      'slot-soon',
      'slot-later',
    ])
    // No interviewer address or uid, and no meeting link before booking.
    expect(Object.keys(availableSlots[0]).sort()).toEqual([
      'date',
      'id',
      'interviewerName',
    ])
    expect(scheduledInterview).toBeNull()
    const [, available] = ranQueries
    expect(available.filters.map(([field, op]) => `${field}${op}`)).toEqual([
      'interviewSlotStatus==',
      'date>',
      'date<',
    ])
    expect(available.orderBy).toBe('date')
  })

  test('includes slots after orientation in dev, where fixture dates go stale', async () => {
    mockDev = true
    slot('slot-after-orientation', { date: timestamp(at(60 * DAY)) })

    const { availableSlots } = await fetchInterviewData('uid-1')

    expect(availableSlots.map((one) => one.id)).toEqual([
      'slot-after-orientation',
    ])
  })

  test("returns the caller's booking, marked completed once its date has passed", async () => {
    slot('slot-mine', {
      date: timestamp(at(-HOUR)),
      interviewSlotStatus: 'pending',
      intervieweeId: 'uid-1',
    })

    const { scheduledInterview } = await fetchInterviewData('uid-1')

    expect(scheduledInterview).toEqual({
      id: 'slot-mine',
      date: expect.any(String),
      interviewerName: 'Demo Admin',
      meetingLink: 'https://zoom.us/j/slot-mine',
      interviewSlotStatus: 'completed',
    })
  })

  test('keeps an upcoming booking as it is stored', async () => {
    slot('slot-mine', {
      interviewSlotStatus: 'pending',
      intervieweeId: 'uid-1',
    })

    const { scheduledInterview } = await fetchInterviewData('uid-1')

    expect(scheduledInterview?.interviewSlotStatus).toBe('pending')
  })

  test("ignores a booking from a previous cycle's interviews", async () => {
    slot('slot-last-year', {
      date: timestamp(at(-300 * DAY)),
      interviewSlotStatus: 'pending',
      intervieweeId: 'uid-1',
    })

    const { scheduledInterview } = await fetchInterviewData('uid-1')

    expect(scheduledInterview).toBeNull()
  })
})

describe('bookInterviewSlot', () => {
  const slotPath = `${interviewCollection}/slot-1`

  test('books the slot for the caller and marks their application interviewed', async () => {
    slot('slot-1')

    const booked = await bookInterviewSlot(APPLICANT, 'slot-1')

    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: slotPath }),
      {
        interviewSlotStatus: 'pending',
        intervieweeFirstName: 'Grace',
        intervieweeLastName: 'Hopper',
        intervieweeEmail: 'grace@example.com',
        intervieweeId: 'uid-1',
      },
    )
    // Only meta.interview: a whole `meta` write would clobber meta.decided and
    // meta.submitted, which admin and ApplyForm own.
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${applicationsCollection}/uid-1` }),
      { 'meta.interview': true },
    )
    expect(booked).toEqual({
      id: 'slot-1',
      date: expect.any(Date),
      interviewerName: 'Demo Admin',
      interviewerUid: 'admin-uid',
      interviewerEmail: 'demo@gbstem.org',
      meetingLink: 'https://zoom.us/j/slot-1',
      intervieweeFirstName: 'Grace',
    })
  })

  test('refuses a slot somebody else has already booked', async () => {
    slot('slot-1', { interviewSlotStatus: 'pending', intervieweeId: 'other' })

    await expect(bookInterviewSlot(APPLICANT, 'slot-1')).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('no longer available'),
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('refuses a slot that is now too soon, or after orientation', async () => {
    slot('slot-1', { date: timestamp(at(HOUR)) })
    await expect(bookInterviewSlot(APPLICANT, 'slot-1')).rejects.toMatchObject({
      status: 409,
    })

    slot('slot-1', { date: timestamp(at(60 * DAY)) })
    await expect(bookInterviewSlot(APPLICANT, 'slot-1')).rejects.toMatchObject({
      status: 409,
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('refuses a second interview in the same cycle', async () => {
    slot('slot-1')
    slot('slot-mine', {
      interviewSlotStatus: 'pending',
      intervieweeId: 'uid-1',
    })

    await expect(bookInterviewSlot(APPLICANT, 'slot-1')).rejects.toMatchObject({
      status: 409,
      message: 'You already have an interview booked.',
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('refuses a caller with no application to interview for', async () => {
    slot('slot-1')
    delete docs[`${applicationsCollection}/uid-1`]

    await expect(bookInterviewSlot(APPLICANT, 'slot-1')).rejects.toMatchObject({
      status: 400,
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('404s a slot that no longer exists', async () => {
    await expect(bookInterviewSlot(APPLICANT, 'slot-1')).rejects.toMatchObject({
      status: 404,
    })
  })
})
