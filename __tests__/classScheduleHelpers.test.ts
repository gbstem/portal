import type {} from '../src/data.d.ts'
import {
  classInstructorUids,
  computeUpdatedClassStatuses,
  computeMeetingTimeChanges,
  findNextClassDateIndex,
  findTodaysSessionIndex,
  heldEarlierToday,
  buildSubRequestPayload,
  rescheduleSessions,
} from '$lib/helpers/classSchedule'
import { ClassStatus } from '$lib/components/helpers/ClassStatus'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'

describe('ClassSchedule Helpers', () => {
  describe('computeUpdatedClassStatuses', () => {
    test('pads status array with ClassInFuture when meetingTimes is longer', () => {
      const now = new Date('2026-05-10T12:00:00Z')
      const meetingTimes = ['2026-05-15T12:00:00Z', '2026-05-20T12:00:00Z']
      const classStatuses: string[] = []
      const feedbackCompleted: boolean[] = [false, false]

      const { updatedStatuses, hasChanged } = computeUpdatedClassStatuses(
        classStatuses,
        feedbackCompleted,
        meetingTimes,
        now,
      )

      expect(hasChanged).toBe(true)
      expect(updatedStatuses).toEqual([
        ClassStatus.ClassInFuture,
        ClassStatus.ClassInFuture,
      ])
    })

    test('marks past class as EverythingComplete if feedback was completed', () => {
      const now = new Date('2026-05-10T12:00:00Z')
      const meetingTimes = ['2026-05-01T12:00:00Z']
      const classStatuses = [ClassStatus.ClassInFuture]
      const feedbackCompleted = [true]

      const { updatedStatuses } = computeUpdatedClassStatuses(
        classStatuses,
        feedbackCompleted,
        meetingTimes,
        now,
      )

      expect(updatedStatuses[0]).toBe(ClassStatus.EverythingComplete)
    })

    test('marks past class as ClassNotHeld if feedback was not completed', () => {
      const now = new Date('2026-05-10T12:00:00Z')
      const meetingTimes = ['2026-05-01T12:00:00Z']
      const classStatuses = [ClassStatus.ClassInFuture]
      const feedbackCompleted = [false]

      const { updatedStatuses } = computeUpdatedClassStatuses(
        classStatuses,
        feedbackCompleted,
        meetingTimes,
        now,
      )

      expect(updatedStatuses[0]).toBe(ClassStatus.ClassNotHeld)
    })
  })

  describe('computeMeetingTimeChanges', () => {
    test('sorts and deduplicates meeting times and adjusts status/feedback arrays for additions/deletions', () => {
      const originalMeetingTimes = [
        '2026-05-10T10:00:00Z',
        '2026-05-20T10:00:00Z',
      ]
      const editedMeetingTimes = [
        '2026-05-20T10:00:00Z',
        '2026-05-05T10:00:00Z', // Added earlier date
      ]
      const feedbackCompleted = [true, false]
      const classStatuses = [
        ClassStatus.EverythingComplete,
        ClassStatus.ClassInFuture,
      ]

      const result = computeMeetingTimeChanges(
        originalMeetingTimes,
        editedMeetingTimes,
        feedbackCompleted,
        classStatuses,
      )

      expect(result.sortedEditedTimes).toEqual([
        '2026-05-05T10:00:00Z',
        '2026-05-20T10:00:00Z',
      ])
      expect(result.newFeedback).toHaveLength(2)
      expect(result.newClassStatuses).toHaveLength(2)
    })
  })

  describe('computeUpdatedClassStatuses - a session held early', () => {
    test('stays held through the half hour before its start, and after it', () => {
      const start = Date.now() + 10 * 60 * 1000
      const meetingTimes = [new Date(start)]

      const before = computeUpdatedClassStatuses(
        [ClassStatus.FeedbackIncomplete],
        [false],
        meetingTimes,
      )
      expect(before.updatedStatuses).toEqual([ClassStatus.FeedbackIncomplete])

      const after = computeUpdatedClassStatuses(
        before.updatedStatuses,
        [false],
        meetingTimes,
        new Date(start + 60 * 60 * 1000),
      )
      expect(after.updatedStatuses).toEqual([ClassStatus.FeedbackIncomplete])
    })
  })

  describe('rescheduleSessions', () => {
    const T = (day: number) => `2026-10-${String(day).padStart(2, '0')}T20:00Z`

    test('keeps each kept session with its own feedback flag and status', () => {
      const result = rescheduleSessions(
        [T(5), T(12), T(19)],
        [T(19), T(5), T(12), T(26)],
        [true, false, true],
        ['EverythingComplete', 'ClassNotHeld', 'EverythingComplete'],
      )

      expect(result).toEqual({
        sortedEditedTimes: [T(5), T(12), T(19), T(26)],
        newFeedback: [true, false, true, false],
        newClassStatuses: [
          'EverythingComplete',
          'ClassNotHeld',
          'EverythingComplete',
          ClassStatus.ClassInFuture,
        ],
      })
    })

    // Removing sessions in ascending order shifted every later index down by
    // one before it was used, so the second removal took out a session that
    // was being kept - and handed its feedback flag to a different week.
    test('removes several sessions without disturbing the ones kept', () => {
      const result = rescheduleSessions(
        [T(5), T(12), T(19), T(26)],
        [T(12), T(26)],
        [false, true, false, true],
        ['A', 'B', 'C', 'D'],
      )

      expect(result.newFeedback).toEqual([true, true])
      expect(result.newClassStatuses).toEqual(['B', 'D'])
    })
  })

  // "Today" on the server is gbSTEM's day, not UTC's: an 8pm Boston class is
  // already tomorrow in UTC.
  describe('findTodaysSessionIndex', () => {
    const ZONE = 'America/New_York'

    test("finds this evening's session even when UTC has rolled over", () => {
      const now = new Date('2026-10-05T23:30:00Z') // 7:30pm in Boston
      const meetingTimes = [
        new Date('2026-09-29T00:00:00Z'),
        new Date('2026-10-06T00:00:00Z'), // 8pm Boston, Oct 5
      ]

      expect(findTodaysSessionIndex(meetingTimes, now, ZONE)).toBe(1)
    })

    test('returns -1 when no session falls on the day', () => {
      const now = new Date('2026-10-07T16:00:00Z')
      const meetingTimes = [new Date('2026-10-06T00:00:00Z')]

      expect(findTodaysSessionIndex(meetingTimes, now, ZONE)).toBe(-1)
    })

    test('with two sessions today, picks the first whose hour has not passed', () => {
      const now = new Date('2026-10-05T19:30:00Z') // 3:30pm in Boston
      const meetingTimes = [
        '2026-10-05T14:00:00Z', // 10am
        '2026-10-05T19:00:00Z', // 3pm - this hour
        '2026-10-05T22:00:00Z', // 6pm
      ]

      expect(findTodaysSessionIndex(meetingTimes, now, ZONE)).toBe(1)
    })

    test('with two sessions today both over, finds none', () => {
      const now = new Date('2026-10-06T02:00:00Z') // 10pm in Boston
      const meetingTimes = ['2026-10-05T14:00:00Z', '2026-10-05T19:00:00Z']

      expect(findTodaysSessionIndex(meetingTimes, now, ZONE)).toBe(-1)
    })
  })

  describe('heldEarlierToday', () => {
    const ZONE = 'America/New_York'
    const now = new Date('2026-10-05T23:30:00Z') // 7:30pm in Boston

    test('counts a session recorded earlier on the same gbSTEM day', () => {
      expect(
        heldEarlierToday([new Date('2026-10-05T13:00:00Z')], now, ZONE),
      ).toBe(true)
    })

    test("ignores yesterday's, and one stamped later than now", () => {
      expect(
        heldEarlierToday(
          [
            new Date('2026-10-05T03:00:00Z'), // 11pm Oct 4 in Boston
            new Date('2026-10-05T23:45:00Z'),
          ],
          now,
          ZONE,
        ),
      ).toBe(false)
    })
  })

  describe('findNextClassDateIndex', () => {
    test('returns index of single class matching today', () => {
      const now = new Date('2026-05-10T12:00:00Z')
      const meetingTimes = [
        '2026-05-01T10:00:00Z',
        '2026-05-10T14:00:00Z', // today
        '2026-05-15T10:00:00Z',
      ]

      expect(findNextClassDateIndex(meetingTimes, now)).toBe(1)
    })

    test('returns index of future class when no classes scheduled today', () => {
      const now = new Date('2026-05-10T12:00:00Z')
      const meetingTimes = ['2026-05-01T10:00:00Z', '2026-05-15T10:00:00Z']

      expect(findNextClassDateIndex(meetingTimes, now)).toBe(1)
    })
  })

  describe('classInstructorUids', () => {
    test('puts the owner first, then the co-instructors', () => {
      expect(
        classInstructorUids({
          instructorUid: 'uid-owner',
          otherInstructorUids: ['uid-co-1', 'uid-co-2'],
        }),
      ).toEqual(['uid-owner', 'uid-co-1', 'uid-co-2'])
    })

    test('drops a missing owner and an absent co-instructor list', () => {
      // A class document written before instructorUid existed. The list is
      // cc'd, so an empty string in it would be resolved as a uid naming
      // nobody rather than simply skipped.
      expect(
        classInstructorUids({ otherInstructorUids: ['uid-co-1'] }),
      ).toEqual(['uid-co-1'])
      expect(classInstructorUids({ instructorUid: '' })).toEqual([])
      expect(classInstructorUids({ instructorUid: 'uid-owner' })).toEqual([
        'uid-owner',
      ])
    })

    test('de-duplicates an owner who is also listed as a co-instructor', () => {
      // The form refuses to add the owner to their own class, but a document
      // written before that check - or by hand - can still carry both.
      expect(
        classInstructorUids({
          instructorUid: 'uid-owner',
          otherInstructorUids: ['uid-owner', 'uid-co-1'],
        }),
      ).toEqual(['uid-owner', 'uid-co-1'])
    })
  })

  describe('buildSubRequestPayload', () => {
    test('creates expected SubRequest object with originalInstructorUid', () => {
      const sub = buildSubRequestPayload({
        classId: 'uid-teacher-1',
        subRequestClassNumber: 2,
        subRequestDate: '2026-05-12T10:00:00Z',
        subRequestNotes: 'Need sub for trip',
        course: 'Python 1',
        instructorUid: 'uid-teacher',
        meetingLink: 'https://teams.microsoft.com/l/meetup-join/...',
      })

      expect(sub.id).toBe('uid-teacher-1')
      expect(sub.classNumber).toBe(2)
      expect(sub.course).toBe('Python 1')
      expect(sub.originalInstructorUid).toBe('uid-teacher')
      expect(sub.subRequestStatus).toBe(SubRequestStatus.SubstituteNeeded)
      // No address is stored on a sub request: both instructors are named by
      // uid, and whoever needs an address resolves it from one.
      expect(sub).not.toHaveProperty('originalInstructorEmail')
      expect(sub).not.toHaveProperty('subInstructorEmail')
      // Nobody else asked, so the requester is the class's own instructor.
      expect(sub.requestedByUid).toBe('uid-teacher')
    })

    test('records a co-instructor as the requester without changing whose class it is', () => {
      const sub = buildSubRequestPayload({
        classId: 'uid-teacher-1',
        subRequestClassNumber: 2,
        subRequestDate: '2026-05-12T10:00:00Z',
        subRequestNotes: 'Need sub for trip',
        course: 'Python 1',
        instructorUid: 'uid-teacher',
        requestedByUid: 'uid-co-instructor',
        meetingLink: 'https://teams.microsoft.com/l/meetup-join/...',
      })

      // The class's instructor of record is unchanged - a sub covers the
      // class, not the person who happened to file the request...
      expect(sub.originalInstructorUid).toBe('uid-teacher')
      // ...but the request now says who to tell when one turns up.
      expect(sub.requestedByUid).toBe('uid-co-instructor')
    })
  })
})
