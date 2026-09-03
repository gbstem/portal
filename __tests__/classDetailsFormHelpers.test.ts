import type {} from '../src/data.d.ts'
import {
  getDefaultClassValues,
  toFormValues,
  normalizeOtherInstructorEmails,
  parseOtherInstructorEmails,
  parseTime,
  getMeetingDates,
  generateNewClassId,
  scheduleSourceChanged,
  SCHEDULE_SOURCE_FIELDS,
} from '$lib/helpers/classDetailsForm'

describe('ClassDetailsForm Helpers', () => {
  describe('getDefaultClassValues & toFormValues', () => {
    test('getDefaultClassValues returns clean default state', () => {
      const def = getDefaultClassValues()
      expect(def.course).toBe('')
      expect(def.classCap).toBe(7)
      expect(def.online).toBe(true)
    })

    test('toFormValues maps Data.Class to form fields', () => {
      const cls = getDefaultClassValues()
      cls.course = 'Python 1'
      cls.classDay1 = 'Monday'
      cls.classTime1 = '4:00 PM'

      const mapped = toFormValues(cls)
      expect(mapped.course).toBe('Python 1')
      expect(mapped.classDay1).toBe('Monday')
      expect(mapped.classTime1).toBe('4:00 PM')
    })
  })

  describe('normalizeOtherInstructorEmails', () => {
    test('trims, lowercases, and removes empty email tokens', () => {
      const raw = ' ALICE@EXAMPLE.COM,  bob@example.com ,  '
      const normalized = normalizeOtherInstructorEmails(raw)
      expect(normalized).toBe('alice@example.com, bob@example.com')
    })

    test('returns empty string for empty input', () => {
      expect(normalizeOtherInstructorEmails('')).toBe('')
    })
  })

  describe('parseOtherInstructorEmails', () => {
    test('splits a normalized ", "-joined string back into addresses', () => {
      const normalized = normalizeOtherInstructorEmails(
        ' ALICE@EXAMPLE.COM,  bob@example.com ,  ',
      )
      expect(parseOtherInstructorEmails(normalized)).toEqual([
        'alice@example.com',
        'bob@example.com',
      ])
    })

    test('returns [] for empty input', () => {
      expect(parseOtherInstructorEmails('')).toEqual([])
    })
  })

  describe('parseTime & getMeetingDates', () => {
    test('parseTime converts PM/AM strings correctly', () => {
      const base = new Date('2026-05-01T00:00:00')
      const parsedPM = parseTime('4:30 PM', base)
      expect(parsedPM.getHours()).toBe(16)
      expect(parsedPM.getMinutes()).toBe(30)

      const parsedAM = parseTime('9:15 AM', base)
      expect(parsedAM.getHours()).toBe(9)
      expect(parsedAM.getMinutes()).toBe(15)
    })

    test('getMeetingDates calculates recurring meeting dates between start and end', () => {
      const start = new Date('2026-05-01T00:00:00') // Friday
      const end = new Date('2026-05-15T00:00:00')

      const dates = getMeetingDates(
        'Monday',
        'Wednesday',
        '4:00 PM',
        '4:00 PM',
        start,
        end,
      )
      expect(dates.length).toBeGreaterThan(0)
      dates.forEach((d) => {
        expect([1, 3]).toContain(d.getDay())
      })
    })
  })

  describe('scheduleSourceChanged', () => {
    const stored = {
      classDay1: 'Tuesday',
      classTime1: '15:30',
      classDay2: 'Thursday',
      classTime2: '16:45',
    } as Partial<Data.Class>

    test('every field the schedule is built from is compared', () => {
      // Pins the list against `getMeetingDates`' signature: a fifth input to
      // the schedule that nobody adds here would silently stop prompting.
      expect([...SCHEDULE_SOURCE_FIELDS]).toEqual([
        'classDay1',
        'classTime1',
        'classDay2',
        'classTime2',
      ])
    })

    test('no change when the schedule fields are identical', () => {
      expect(scheduleSourceChanged(stored, { ...stored })).toBe(false)
    })

    test('ignores fields the schedule is not built from', () => {
      // The whole point of the change: editing the cap must not offer to
      // rebuild a schedule that is still correct.
      expect(
        scheduleSourceChanged(stored, {
          ...stored,
          classCap: 30,
          course: 'Mathematics 2a',
          online: false,
          meetingLink: 'https://example.com/other',
        } as Partial<Data.Class>),
      ).toBe(false)
    })

    test.each([...SCHEDULE_SOURCE_FIELDS])(
      'detects a change to %s',
      (field) => {
        expect(
          scheduleSourceChanged(stored, { ...stored, [field]: 'Saturday' }),
        ).toBe(true)
      },
    )

    test('detects a second meeting day being added or dropped', () => {
      expect(
        scheduleSourceChanged(stored, {
          ...stored,
          classDay2: '',
          classTime2: '',
        }),
      ).toBe(true)
      expect(
        scheduleSourceChanged(
          { classDay1: 'Tuesday', classTime1: '15:30' } as Partial<Data.Class>,
          stored,
        ),
      ).toBe(true)
    })

    test('an absent field and an empty one are the same schedule', () => {
      // A class document written before `classDay2` existed omits it; that is
      // not an edit, so it must not prompt the instructor to rebuild.
      const legacy = {
        classDay1: 'Tuesday',
        classTime1: '15:30',
      } as Partial<Data.Class>
      const current = { ...legacy, classDay2: '', classTime2: '' }
      expect(scheduleSourceChanged(legacy, current)).toBe(false)
      expect(scheduleSourceChanged(current, legacy)).toBe(false)
    })
  })

  describe('generateNewClassId', () => {
    test('generates next sequential class ID for user', () => {
      const existing = ['uid1-1', 'uid1-2', 'other-1']
      const newId = generateNewClassId(existing, 'uid1')
      expect(newId).toBe('uid1-3')
    })

    test('defaults to 1 if no previous classes exist for user', () => {
      const newId = generateNewClassId([], 'uid1')
      expect(newId).toBe('uid1-1')
    })
  })
})
