import type {} from '../src/data.d.ts'
import {
  parseClassInfoDoc,
  sortClassesBySpotsRemaining,
  isGradeEligible,
  buildPortalEnrollApiPayload,
  type ClassInfo,
} from '$lib/helpers/classesPage'

describe('ClassesPage Helpers', () => {
  describe('parseClassInfoDoc', () => {
    test('parses raw doc data into ClassInfo object with remaining spots and days/times', () => {
      const raw = {
        className: 'Python 101',
        course: 'Python 1',
        instructorFirstName: 'Alice',
        instructorLastName: 'Smith',
        instructorEmail: 'alice@example.com',
        classCap: 10,
        students: ['s1', 's2'],
        meetingLink: 'https://teams.microsoft.com/...',
        gradeRecommendation: '3rd-5th',
        online: true,
        classDay1: 'Monday',
        classTime1: '4:00 PM',
        classDay2: 'Wednesday',
        classTime2: '4:00 PM',
      }

      const info = parseClassInfoDoc('class-1', raw)
      expect(info.id).toBe('class-1')
      expect(info.spotsRemaining).toBe(8)
      expect(info.classDays).toEqual(['Monday', 'Wednesday'])
      expect(info.classTimes).toEqual(['4:00 PM', '4:00 PM'])
    })
  })

  describe('sortClassesBySpotsRemaining', () => {
    test('sorts classes descending by spots remaining', () => {
      const c1 = { spotsRemaining: 2 } as ClassInfo
      const c2 = { spotsRemaining: 8 } as ClassInfo
      const c3 = { spotsRemaining: 5 } as ClassInfo

      const sorted = sortClassesBySpotsRemaining([c1, c2, c3])
      expect(sorted.map((c) => c.spotsRemaining)).toEqual([8, 5, 2])
    })
  })

  describe('isGradeEligible', () => {
    test('allows enrollment if ageBypassEnabled is true', () => {
      const res = isGradeEligible('Python 1', 'K', true)
      expect(res.eligible).toBe(true)
    })

    test('rejects enrollment if student grade is K or below min grade', () => {
      const resK = isGradeEligible('Python 1', 'K', false)
      expect(resK.eligible).toBe(false)
      expect(resK.requiredGrade).toBe(3)

      const res2nd = isGradeEligible('Python 1', '2', false)
      expect(res2nd.eligible).toBe(false)
      expect(res2nd.requiredGrade).toBe(3)
    })

    test('allows enrollment if student grade is at or above min grade', () => {
      const res3rd = isGradeEligible('Python 1', '3', false)
      expect(res3rd.eligible).toBe(true)

      const res5th = isGradeEligible('Python 1', '5', false)
      expect(res5th.eligible).toBe(true)
    })
  })

  describe('buildPortalEnrollApiPayload', () => {
    test('constructs API payload for enrollment', () => {
      const classInfo: ClassInfo = {
        id: 'c1',
        className: 'Python 1',
        classDays: ['Mon', 'Wed'],
        classTimes: ['4pm', '4pm'],
        course: 'Python 1',
        instructorFirstName: 'Alice',
        instructorLastName: 'Smith',
        instructorEmail: 'alice@example.com',
        spotsRemaining: 5,
        meetingLink: 'link',
        gradeRecommendation: '3+',
        online: true,
      }

      const payload = buildPortalEnrollApiPayload('Parent', classInfo, 'Child')
      expect(payload).toEqual({
        firstName: 'Parent',
        instructor: 'Alice',
        instructorEmail: 'alice@example.com',
        classTimes: ['4pm', '4pm'],
        classDays: ['Mon', 'Wed'],
        course: 'Python 1',
        meetingLink: 'link',
        online: true,
        studentName: 'Child',
      })
    })
  })
})
