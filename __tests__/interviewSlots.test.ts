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
  interviewTimeRequestsCollection,
} from '$lib/data/collections'
import {
  bookInterviewSlot,
  fetchInterviewData,
  recordSlotRequest,
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
    set: async (data: unknown) => {
      docs[path] = data
    },
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

  // Marked missed in admin: it no longer holds their interview, so the
  // booking list shows again.
  test('ignores a booking that was missed', async () => {
    slot('slot-missed', {
      date: timestamp(at(-HOUR)),
      interviewSlotStatus: 'missed',
      missedBy: 'interviewer',
      intervieweeId: 'uid-1',
    })

    const { scheduledInterview } = await fetchInterviewData('uid-1')

    expect(scheduledInterview).toBeNull()
  })

  test('shows the booking made after a missed one', async () => {
    slot('slot-missed', {
      date: timestamp(at(-HOUR)),
      interviewSlotStatus: 'missed',
      missedBy: 'interviewee',
      intervieweeId: 'uid-1',
    })
    slot('slot-rebooked', {
      interviewSlotStatus: 'pending',
      intervieweeId: 'uid-1',
    })

    const { scheduledInterview } = await fetchInterviewData('uid-1')

    expect(scheduledInterview?.id).toBe('slot-rebooked')
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
        intervieweeId: 'uid-1',
      },
    )
    // The booking names the applicant by uid only. Admin's interview views
    // resolve their current address from it, so a slot can't carry one that
    // went stale when they changed their account email.
    expect(transaction.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: slotPath }),
      expect.objectContaining({ intervieweeEmail: expect.anything() }),
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

  // meta.interview is set with every booking and cleared when one is
  // cancelled or missed, so it alone says whether they have one.
  test('refuses a second interview while one is booked or held', async () => {
    slot('slot-1')
    docs[`${applicationsCollection}/uid-1`].meta.interview = true

    await expect(bookInterviewSlot(APPLICANT, 'slot-1')).rejects.toMatchObject({
      status: 409,
      message: 'You already have an interview scheduled.',
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('refuses an applicant who already has a decision', async () => {
    slot('slot-1')
    docs[`${applicationsCollection}/uid-1`].meta.decisionType = 'rejected'

    await expect(bookInterviewSlot(APPLICANT, 'slot-1')).rejects.toMatchObject({
      status: 409,
      message: 'A decision has already been made on your application.',
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('books an applicant invited to interview', async () => {
    slot('slot-1')
    docs[`${applicationsCollection}/uid-1`].meta.decisionType = 'interview'

    await bookInterviewSlot(APPLICANT, 'slot-1')

    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${applicationsCollection}/uid-1` }),
      { 'meta.interview': true },
    )
  })

  test.each([
    ['no application', undefined],
    ['an unsubmitted application', { meta: { submitted: false } }],
  ])('refuses a caller with %s', async (_, application) => {
    slot('slot-1')
    if (application) {
      docs[`${applicationsCollection}/uid-1`] = application
    } else {
      delete docs[`${applicationsCollection}/uid-1`]
    }

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

describe('recordSlotRequest', () => {
  const requestPath = (requestedTime: string) =>
    `${interviewTimeRequestsCollection}/uid-1-${requestedTime}`

  test("saves the request under the applicant's uid, with their profile name", async () => {
    const date = at(2 * DAY)

    await expect(
      recordSlotRequest('uid-1', '2026-10-05T14:00', date),
    ).resolves.toEqual({ firstName: 'Grace' })

    // The name comes from the profile, never from the request.
    expect(docs[requestPath('2026-10-05T14:00')]).toEqual({
      uid: 'uid-1',
      firstName: 'Grace',
      lastName: 'Hopper',
      date,
    })
  })

  test.each([
    ['already has an interview', { submitted: true, interview: true }, 409],
    [
      'already has a decision',
      { submitted: true, decisionType: 'accepted' },
      409,
    ],
    ['has not submitted', { submitted: false }, 400],
  ])(
    'refuses an applicant who %s, and saves nothing',
    async (_, meta, status) => {
      docs[`${applicationsCollection}/uid-1`] = { meta }

      await expect(
        recordSlotRequest('uid-1', '2026-10-05T14:00', at(2 * DAY)),
      ).rejects.toMatchObject({ status })
      expect(docs[requestPath('2026-10-05T14:00')]).toBeUndefined()
    },
  )

  test('refuses a time in the past, and saves nothing', async () => {
    await expect(
      recordSlotRequest('uid-1', '2020-10-05T14:00', at(-DAY)),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Please pick a time in the future.',
    })
    expect(docs[requestPath('2020-10-05T14:00')]).toBeUndefined()
  })

  test('refuses a time after interviews close', async () => {
    await expect(
      recordSlotRequest('uid-1', '2099-10-05T14:00', at(60 * DAY)),
    ).rejects.toMatchObject({ status: 400 })
  })

  test('skips the time checks in dev, as the form does - fixture dates go stale', async () => {
    mockDev = true

    await recordSlotRequest('uid-1', '2020-10-05T14:00', at(-DAY))

    expect(docs[requestPath('2020-10-05T14:00')]).toBeDefined()
  })
})
