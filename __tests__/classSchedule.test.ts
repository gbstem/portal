const mockDoc = jest.fn()
const mockRunTransaction = jest.fn()
const mockIsAcceptedInstructor = jest.fn()

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    doc: (...args: any[]) => mockDoc(...args),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
}))

jest.mock('#lib/server/instructorDirectory.js', () => ({
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

import { ClassStatus } from '#lib/components/helpers/ClassStatus.js'
import { classesCollection } from '#lib/data/collections.js'
import {
  holdClassSession,
  NO_SESSION_TODAY,
  refreshClassStatuses,
  rescheduleClass,
} from '#lib/server/classSchedule.js'

const CLASS_ID = 'owner-uid-1'
const CLASS_PATH = `${classesCollection}/${CLASS_ID}`
const OWNER = { uid: 'owner-uid' }
const CO = { uid: 'co-uid' }

let docs: Record<string, any>
let transaction: { get: jest.Mock; update: jest.Mock }

const timestamp = (iso: string) => ({ toDate: () => new Date(iso) })

function storeClass(overrides: Record<string, unknown> = {}) {
  docs[CLASS_PATH] = {
    instructorUid: 'owner-uid',
    otherInstructorUids: ['co-uid'],
    meetingLink: 'https://zoom.us/j/1',
    meetingTimes: [
      timestamp('2026-10-05T20:00:00.000Z'),
      timestamp('2026-10-12T20:00:00.000Z'),
      timestamp('2026-10-19T20:00:00.000Z'),
    ],
    feedbackCompleted: [true, false, false],
    classStatuses: [
      ClassStatus.EverythingComplete,
      ClassStatus.ClassInFuture,
      ClassStatus.ClassInFuture,
    ],
    completedClassDates: [timestamp('2026-10-05T20:05:00.000Z')],
    ...overrides,
  }
}

/** The fields the one transaction.update call wrote. */
const written = () => {
  expect(transaction.update).toHaveBeenCalledTimes(1)
  const [ref, fields] = transaction.update.mock.calls[0]
  expect(ref.path).toBe(CLASS_PATH)
  return fields
}

beforeEach(() => {
  jest.clearAllMocks()
  docs = {}
  storeClass()
  mockDoc.mockImplementation((path: string) => ({ path }))
  transaction = {
    get: jest.fn(async (ref: { path: string }) => ({
      exists: ref.path in docs,
      data: () => docs[ref.path],
    })),
    update: jest.fn(),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
  mockIsAcceptedInstructor.mockResolvedValue(true)
})

describe('who may change a class schedule', () => {
  const actions = [
    [
      'refreshClassStatuses',
      (caller: any) => refreshClassStatuses(caller, CLASS_ID),
    ],
    [
      'rescheduleClass',
      (caller: any) =>
        rescheduleClass(caller, CLASS_ID, [new Date('2026-10-05T20:00:00Z')]),
    ],
    ['holdClassSession', (caller: any) => holdClassSession(caller, CLASS_ID)],
  ] as const

  test.each(actions)(
    '%s refuses an instructor who was not accepted',
    async (_, act) => {
      mockIsAcceptedInstructor.mockResolvedValue(false)
      await expect(act(OWNER)).rejects.toMatchObject({ status: 403 })
      expect(mockRunTransaction).not.toHaveBeenCalled()
    },
  )

  test.each(actions)(
    "%s refuses an accepted instructor who doesn't teach the class",
    async (_, act) => {
      await expect(act({ uid: 'stranger-uid' })).rejects.toMatchObject({
        status: 403,
      })
      expect(transaction.update).not.toHaveBeenCalled()
    },
  )

  test.each(actions)('%s 404s a class that is gone', async (_, act) => {
    delete docs[CLASS_PATH]
    await expect(act(OWNER)).rejects.toMatchObject({ status: 404 })
  })
})

describe('refreshClassStatuses', () => {
  test('marks passed sessions from the stored feedback, and saves only a change', async () => {
    const statuses = await refreshClassStatuses(
      CO,
      CLASS_ID,
      new Date('2026-10-13T12:00:00Z'),
    )

    expect(statuses).toEqual([
      ClassStatus.EverythingComplete,
      ClassStatus.ClassNotHeld,
      ClassStatus.ClassInFuture,
    ])
    expect(written()).toEqual({ classStatuses: statuses })
  })

  test('writes nothing when the statuses are already current', async () => {
    await refreshClassStatuses(
      OWNER,
      CLASS_ID,
      new Date('2026-10-06T12:00:00Z'),
    )
    expect(transaction.update).not.toHaveBeenCalled()
  })
})

describe('rescheduleClass', () => {
  test("keeps each kept session's progress, worked out from the class as stored", async () => {
    const saved = await rescheduleClass(OWNER, CLASS_ID, [
      new Date('2026-10-26T20:00:00.000Z'),
      // Seconds the schedule's inputs can't show still match the stored time.
      new Date('2026-10-05T20:00:00.000Z'),
      new Date('2026-10-19T20:00:00.000Z'),
    ])

    const expected = {
      feedbackCompleted: [true, false, false],
      classStatuses: [
        ClassStatus.EverythingComplete,
        ClassStatus.ClassInFuture,
        ClassStatus.ClassInFuture,
      ],
    }
    expect(saved).toEqual({
      meetingTimes: [
        '2026-10-05T20:00:00.000Z',
        '2026-10-19T20:00:00.000Z',
        '2026-10-26T20:00:00.000Z',
      ],
      ...expected,
    })
    expect(written()).toEqual({
      meetingTimes: [
        new Date('2026-10-05T20:00:00.000Z'),
        new Date('2026-10-19T20:00:00.000Z'),
        new Date('2026-10-26T20:00:00.000Z'),
      ],
      ...expected,
    })
  })

  test('matches stored times to the minute', async () => {
    storeClass({
      meetingTimes: [timestamp('2026-10-05T20:00:37.412Z')],
      feedbackCompleted: [true],
      classStatuses: [ClassStatus.EverythingComplete],
    })

    const saved = await rescheduleClass(OWNER, CLASS_ID, [
      new Date('2026-10-05T20:00:00.000Z'),
    ])

    expect(saved.feedbackCompleted).toEqual([true])
    expect(saved.classStatuses).toEqual([ClassStatus.EverythingComplete])
  })
})

describe('holdClassSession', () => {
  // 4:15pm in Boston on Oct 12 - and already Oct 12 in UTC too.
  const DURING_SESSION_2 = new Date('2026-10-12T20:15:00Z')

  test("marks today's session held and stamps when, returning the stored link", async () => {
    await expect(
      holdClassSession(CO, CLASS_ID, DURING_SESSION_2),
    ).resolves.toEqual({ meetingLink: 'https://zoom.us/j/1' })

    const fields = written()
    expect(fields.classStatuses).toEqual([
      ClassStatus.EverythingComplete,
      ClassStatus.FeedbackIncomplete,
      ClassStatus.ClassInFuture,
    ])
    expect(fields.completedClassDates).toEqual([
      new Date('2026-10-05T20:05:00.000Z'),
      DURING_SESSION_2,
    ])
  })

  test('marks the session complete when its feedback is already in', async () => {
    storeClass({ feedbackCompleted: [true, true, false] })
    await holdClassSession(OWNER, CLASS_ID, DURING_SESSION_2)
    expect(written().classStatuses[1]).toBe(ClassStatus.EverythingComplete)
  })

  test('stamps a day only once, however many times the class is joined', async () => {
    storeClass({
      completedClassDates: [timestamp('2026-10-12T20:01:00.000Z')],
    })
    await holdClassSession(OWNER, CLASS_ID, DURING_SESSION_2)
    expect(written().completedClassDates).toEqual([
      new Date('2026-10-12T20:01:00.000Z'),
    ])
  })

  // An 8pm Boston class is already the next day in UTC; the server's clock
  // must not decide which day it is.
  test("finds an evening session on gbSTEM's calendar, not UTC's", async () => {
    storeClass({
      meetingTimes: [timestamp('2026-10-13T00:00:00.000Z')], // 8pm Oct 12
      feedbackCompleted: [false],
      classStatuses: [ClassStatus.ClassUpcomingSoon],
      completedClassDates: [],
    })

    await holdClassSession(OWNER, CLASS_ID, new Date('2026-10-12T23:50:00Z'))

    expect(written().classStatuses).toEqual([ClassStatus.FeedbackIncomplete])
  })

  test('pads a status array written out of step with the schedule', async () => {
    storeClass({ classStatuses: [ClassStatus.EverythingComplete] })
    await holdClassSession(OWNER, CLASS_ID, DURING_SESSION_2)
    expect(written().classStatuses).toEqual([
      ClassStatus.EverythingComplete,
      ClassStatus.FeedbackIncomplete,
      ClassStatus.ClassInFuture,
    ])
  })

  test('refuses a day with no session, and writes nothing', async () => {
    await expect(
      holdClassSession(OWNER, CLASS_ID, new Date('2026-10-14T20:00:00Z')),
    ).rejects.toMatchObject({ status: 400, message: NO_SESSION_TODAY })
    expect(transaction.update).not.toHaveBeenCalled()
  })
})
