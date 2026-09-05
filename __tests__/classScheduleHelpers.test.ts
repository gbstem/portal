import type {} from '../src/data.d.ts'
import {
  computeUpdatedClassStatuses,
  computeMeetingTimeChanges,
  findNextClassDateIndex,
  transformStudentDocData,
  buildSubRequestPayload,
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

  describe('transformStudentDocData', () => {
    test('returns null for null or missing personal data', () => {
      expect(transformStudentDocData(null)).toBeNull()
      expect(transformStudentDocData({})).toBeNull()
    })

    test('transforms raw doc data to Student object', () => {
      const data = {
        personal: {
          studentFirstName: 'Alice',
          studentLastName: 'Smith',
          email: 'alice@example.com',
          secondaryEmail: 'parent@example.com',
          phoneNumber: '555-0199',
        },
        academic: {
          grade: '5th',
          school: 'Oak Elementary',
        },
      }

      const student = transformStudentDocData(data)
      expect(student).toEqual({
        name: 'Alice Smith',
        email: 'alice@example.com',
        secondaryEmail: 'parent@example.com',
        phone: '555-0199',
        grade: '5th',
        school: 'Oak Elementary',
      })
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
        instructorEmail: 'teacher@example.com',
        instructorUid: 'uid-teacher',
        meetingLink: 'https://teams.microsoft.com/l/meetup-join/...',
      })

      expect(sub.id).toBe('uid-teacher-1')
      expect(sub.classNumber).toBe(2)
      expect(sub.course).toBe('Python 1')
      expect(sub.originalInstructorUid).toBe('uid-teacher')
      expect(sub.subRequestStatus).toBe(SubRequestStatus.SubstituteNeeded)
    })
  })
})
