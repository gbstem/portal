const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockRunTransaction = jest.fn()

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
    collection: (...args: any[]) => mockCollection(...args),
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

import type { InterviewWindow } from '#lib/shared/interviews.js'
import {
  applicationsCollection,
  currentSemester,
  interviewAvailabilityCollection,
  interviewCollection,
} from '#lib/data/collections.js'
import {
  bookInterviewTime,
  cancelInterview,
  fetchInterviewData,
  saveAvailability,
} from '#lib/server/interviewSlots.js'

type Filter = [field: string, op: string, value: unknown]

/** Every document the fake Firestore holds, by path. */
let docs: Record<string, any>
let transaction: { get: jest.Mock; update: jest.Mock }
/** What each transaction.update wrote, applied to `docs` as Firestore would. */
function applyUpdate(ref: { path: string }, data: Record<string, unknown>) {
  // Copied along each written path, so a test's earlier snapshot stays as it was.
  const next = { ...docs[ref.path] }
  for (const [key, value] of Object.entries(data)) {
    const parts = key.split('.')
    let target = next
    for (const part of parts.slice(0, -1)) {
      target[part] = { ...target[part] }
      target = target[part]
    }
    target[parts.at(-1)!] = value
  }
  docs[ref.path] = next
}
/** Every query `.get()` ran, by its filters, for asserting on. */
let ranQueries: { filters: Filter[]; orderBy?: string }[]

const at = (offsetMs: number) => new Date(Date.now() + offsetMs)

// Anchored to now, so the tests hold whenever they run: interviews opened ten
// days ago and close in thirty. Reset before each test.
let interviews: InterviewWindow
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
    ref: { path, id: path.split('/').pop() },
    exists: path in docs,
    data: () => docs[path],
  }
}

/** A collection query that honours ==, >, >= and < filters and one ascending orderBy. */
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
            if (op === '>=') return actual >= expected
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
  interviews = { opens: at(-10 * DAY), closes: at(30 * DAY) }
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
    delete: async () => {
      delete docs[path]
    },
  }))
  mockCollection.mockImplementation((path: string) => makeQuery(path))
  transaction = {
    get: jest.fn(async (target: any) =>
      'path' in target ? snapshot(target.path) : target.get(),
    ),
    update: jest.fn(applyUpdate),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
})

describe('fetchInterviewData', () => {
  test('lists bookable times soonest first, once each, and nothing else about the slots', async () => {
    const soon = at(5 * HOUR)
    const later = at(2 * DAY)
    slot('slot-later', { date: timestamp(later) })
    slot('slot-later-too', { date: timestamp(later), interviewerUid: 'b' })
    slot('slot-soon', { date: timestamp(soon) })
    slot('slot-too-soon', { date: timestamp(at(1 * HOUR)) })
    slot('slot-booked', {
      date: timestamp(at(DAY)),
      interviewSlotStatus: 'pending',
      intervieweeId: 'someone-else',
    })
    slot('slot-after-window', { date: timestamp(at(60 * DAY)) })

    const data = await fetchInterviewData('uid-1', interviews)

    // Two interviewers free at once are one time: the applicant picks a
    // time, and no slot id, interviewer or link leaves the server.
    expect(data.availableTimes).toEqual([
      soon.toISOString(),
      later.toISOString(),
    ])
    expect(data.scheduledInterview).toBeNull()
    expect(data.availability).toBeNull()
    expect(data.interviewWindow).toEqual({
      opens: interviews.opens.toISOString(),
      closes: interviews.closes.toISOString(),
    })
    const [, available] = ranQueries
    expect(available.filters.map(([field, op]) => `${field}${op}`)).toEqual([
      'interviewSlotStatus==',
      'date>',
      'date>=',
      'date<',
    ])
    expect(available.orderBy).toBe('date')
  })

  test('leaves out slots before interviews open', async () => {
    interviews = { ...interviews, opens: at(10 * DAY) }
    slot('slot-before-window', { date: timestamp(at(2 * DAY)) })
    const inWindow = at(20 * DAY)
    slot('slot-in-window', { date: timestamp(inWindow) })

    const { availableTimes } = await fetchInterviewData('uid-1', interviews)

    expect(availableTimes).toEqual([inWindow.toISOString()])
  })

  test("returns the caller's painted times still to come", async () => {
    const past = at(-HOUR)
    const future = at(DAY)
    const updated = at(-DAY)
    docs[`${interviewAvailabilityCollection}/uid-1`] = {
      times: [timestamp(future), timestamp(past)],
      updated: timestamp(updated),
    }

    const { availability } = await fetchInterviewData('uid-1', interviews)

    expect(availability).toEqual({
      times: [future.toISOString()],
      updated: updated.toISOString(),
    })
  })

  test("returns the caller's booking, marked completed once its date has passed", async () => {
    slot('slot-mine', {
      date: timestamp(at(-HOUR)),
      interviewSlotStatus: 'pending',
      intervieweeId: 'uid-1',
    })

    const { scheduledInterview } = await fetchInterviewData('uid-1', interviews)

    expect(scheduledInterview).toEqual({
      id: 'slot-mine',
      date: expect.any(String),
      interviewerName: 'Demo Admin',
      meetingLink: 'https://zoom.us/j/slot-mine',
      interviewSlotStatus: 'completed',
    })
  })

  // Marked missed in admin: it no longer holds their interview, so the
  // booking calendar shows again.
  test('ignores a booking that was missed, and shows the one made after it', async () => {
    slot('slot-missed', {
      date: timestamp(at(-HOUR)),
      interviewSlotStatus: 'missed',
      missedBy: 'interviewee',
      intervieweeId: 'uid-1',
    })
    expect(
      (await fetchInterviewData('uid-1', interviews)).scheduledInterview,
    ).toBeNull()

    slot('slot-rebooked', {
      interviewSlotStatus: 'pending',
      intervieweeId: 'uid-1',
    })
    expect(
      (await fetchInterviewData('uid-1', interviews)).scheduledInterview?.id,
    ).toBe('slot-rebooked')
  })
})

describe('bookInterviewTime', () => {
  const WHEN = at(2 * DAY)
  const slotPath = (id: string) => `${interviewCollection}/${id}`

  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('books a slot at that time for the caller and marks their application interviewed', async () => {
    slot('slot-1', { date: timestamp(WHEN) })

    const { booked, released } = await bookInterviewTime(
      APPLICANT,
      WHEN,
      interviews,
    )

    expect(docs[slotPath('slot-1')]).toMatchObject({
      interviewSlotStatus: 'pending',
      intervieweeFirstName: 'Grace',
      intervieweeLastName: 'Hopper',
      intervieweeId: 'uid-1',
    })
    // Only meta.interview: a whole `meta` write would clobber meta.decided and
    // meta.submitted, which admin and ApplyForm own.
    expect(transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${applicationsCollection}/uid-1` }),
      { 'meta.interview': true },
    )
    expect(booked).toEqual({
      id: 'slot-1',
      date: WHEN,
      interviewerName: 'Demo Admin',
      interviewerUid: 'admin-uid',
      meetingLink: 'https://zoom.us/j/slot-1',
      intervieweeFirstName: 'Grace',
    })
    expect(released).toBeUndefined()
  })

  test("books another interviewer's slot when the first is taken in between", async () => {
    slot('slot-a', { date: timestamp(WHEN) })
    slot('slot-b', { date: timestamp(WHEN), interviewerUid: 'other-uid' })
    // Someone else takes slot-a between the listing and its transaction.
    let first = true
    transaction.get.mockImplementation(async (target: any) => {
      if ('path' in target && first && target.path.endsWith('slot-a')) {
        first = false
        docs[target.path] = {
          ...docs[target.path],
          interviewSlotStatus: 'pending',
        }
      }
      return 'path' in target ? snapshot(target.path) : target.get()
    })

    const { booked } = await bookInterviewTime(APPLICANT, WHEN, interviews)

    expect(booked.interviewerUid).toBe('other-uid')
    expect(docs[slotPath('slot-b')].intervieweeId).toBe('uid-1')
  })

  test('refuses a time nobody offers any more', async () => {
    slot('slot-1', {
      date: timestamp(WHEN),
      interviewSlotStatus: 'pending',
      intervieweeId: 'other',
    })

    await expect(
      bookInterviewTime(APPLICANT, WHEN, interviews),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('no longer available'),
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test.each([
    ['too soon', () => at(HOUR)],
    ['after the window', () => at(60 * DAY)],
  ])('refuses a time %s', async (_, when) => {
    const date = when()
    slot('slot-1', { date: timestamp(date) })

    await expect(
      bookInterviewTime(APPLICANT, date, interviews),
    ).rejects.toMatchObject({ status: 409 })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  // meta.interview is set with every booking and cleared when one is
  // cancelled or missed, so it alone says whether they have one.
  test.each([
    [
      'a second interview while one is booked',
      { interview: true },
      409,
      'You already have an interview scheduled.',
    ],
    [
      'an applicant who already has a decision',
      { decisionType: 'rejected' },
      409,
      'A decision has already been made on your application.',
    ],
    ['an unsubmitted application', { submitted: false }, 400, undefined],
  ])('refuses %s', async (_, meta, status, message) => {
    slot('slot-1', { date: timestamp(WHEN) })
    Object.assign(docs[`${applicationsCollection}/uid-1`].meta, meta)

    await expect(
      bookInterviewTime(APPLICANT, WHEN, interviews),
    ).rejects.toMatchObject({ status, ...(message ? { message } : {}) })
    expect(transaction.update).not.toHaveBeenCalled()
  })

  test('books an applicant invited to interview', async () => {
    slot('slot-1', { date: timestamp(WHEN) })
    docs[`${applicationsCollection}/uid-1`].meta.decisionType = 'interview'

    await bookInterviewTime(APPLICANT, WHEN, interviews)

    expect(docs[slotPath('slot-1')].intervieweeId).toBe('uid-1')
  })

  describe('rescheduling', () => {
    const OLD = at(DAY)
    beforeEach(() => {
      docs[`${applicationsCollection}/uid-1`].meta.interview = true
      slot('slot-old', {
        date: timestamp(OLD),
        interviewerUid: 'old-uid',
        interviewerName: 'Old Interviewer',
        interviewSlotStatus: 'pending',
        intervieweeId: 'uid-1',
        intervieweeFirstName: 'Grace',
        intervieweeLastName: 'Hopper',
      })
      slot('slot-new', { date: timestamp(WHEN) })
    })

    test('gives the current interview back in the same transaction', async () => {
      const { booked, released } = await bookInterviewTime(
        APPLICANT,
        WHEN,
        interviews,
        { reschedule: true },
      )

      expect(booked.id).toBe('slot-new')
      expect(docs[slotPath('slot-new')].intervieweeId).toBe('uid-1')
      expect(docs[slotPath('slot-old')]).toMatchObject({
        interviewSlotStatus: 'available',
        intervieweeId: '',
        intervieweeFirstName: '',
        intervieweeLastName: '',
      })
      expect(docs[`${applicationsCollection}/uid-1`].meta.interview).toBe(true)
      expect(released).toEqual({
        id: 'slot-old',
        date: OLD,
        interviewerName: 'Old Interviewer',
        interviewerUid: 'old-uid',
        intervieweeName: 'Grace Hopper',
      })
    })

    test('refuses to move an interview whose time has come', async () => {
      docs[slotPath('slot-old')].date = timestamp(at(-HOUR))

      await expect(
        bookInterviewTime(APPLICANT, WHEN, interviews, { reschedule: true }),
      ).rejects.toMatchObject({ status: 409 })
      expect(transaction.update).not.toHaveBeenCalled()
    })

    test('still refuses a second interview without asking to reschedule', async () => {
      await expect(
        bookInterviewTime(APPLICANT, WHEN, interviews),
      ).rejects.toMatchObject({ status: 409 })
      expect(docs[slotPath('slot-old')].intervieweeId).toBe('uid-1')
    })
  })
})

describe('cancelInterview', () => {
  beforeEach(() => {
    docs[`${applicationsCollection}/uid-1`].meta.interview = true
    slot('slot-mine', {
      date: timestamp(at(DAY)),
      interviewSlotStatus: 'pending',
      intervieweeId: 'uid-1',
      intervieweeFirstName: 'Grace',
      intervieweeLastName: 'Hopper',
    })
  })

  test('opens the slot again and frees the applicant to book, together', async () => {
    const released = await cancelInterview(APPLICANT)

    expect(docs[`${interviewCollection}/slot-mine`]).toMatchObject({
      interviewSlotStatus: 'available',
      intervieweeId: '',
    })
    expect(docs[`${applicationsCollection}/uid-1`].meta.interview).toBe(false)
    expect(released).toMatchObject({
      id: 'slot-mine',
      interviewerUid: 'admin-uid',
      intervieweeName: 'Grace Hopper',
    })
  })

  test.each([
    [
      'an interview whose time has come',
      () => {
        docs[`${interviewCollection}/slot-mine`].date = timestamp(at(-HOUR))
      },
    ],
    [
      'no interview at all',
      () => {
        delete docs[`${interviewCollection}/slot-mine`]
      },
    ],
    [
      'a missed one',
      () => {
        docs[`${interviewCollection}/slot-mine`].interviewSlotStatus = 'missed'
      },
    ],
    [
      'an applicant already decided',
      () => {
        docs[`${applicationsCollection}/uid-1`].meta.decisionType = 'accepted'
      },
    ],
  ])('refuses (409) %s, changing nothing', async (_, setUp) => {
    setUp()

    await expect(cancelInterview(APPLICANT)).rejects.toMatchObject({
      status: 409,
    })
    expect(transaction.update).not.toHaveBeenCalled()
  })
})

describe('saveAvailability', () => {
  const path = `${interviewAvailabilityCollection}/uid-1`
  const NOW = new Date()
  // On a quarter hour, as every grid row is.
  const row = (offsetMs: number) => {
    const ms = NOW.getTime() + offsetMs
    return new Date(ms - (ms % (15 * 60_000)))
  }

  test("replaces the caller's availability with the times worth keeping", async () => {
    docs[path] = { uid: 'uid-1', times: [timestamp(row(3 * DAY))] }
    const times = [row(2 * DAY), row(DAY), row(DAY), row(-DAY), row(60 * DAY)]

    const saved = await saveAvailability('uid-1', times, interviews, NOW)

    expect(saved).toEqual({
      firstName: 'Grace',
      times: [row(DAY), row(2 * DAY)],
    })
    expect(docs[path]).toEqual({
      uid: 'uid-1',
      times: [row(DAY), row(2 * DAY)],
      updated: NOW,
      semester: currentSemester,
    })
  })

  test('clears it when nothing worth keeping is left', async () => {
    docs[path] = { uid: 'uid-1', times: [timestamp(row(3 * DAY))] }

    await expect(
      saveAvailability('uid-1', [row(-DAY)], interviews, NOW),
    ).resolves.toEqual({ firstName: 'Grace', times: [] })
    expect(docs[path]).toBeUndefined()
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
        saveAvailability('uid-1', [row(DAY)], interviews, NOW),
      ).rejects.toMatchObject({ status })
      expect(docs[path]).toBeUndefined()
    },
  )
})
