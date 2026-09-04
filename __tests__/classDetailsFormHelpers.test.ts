import type {} from '../src/data.d.ts'
import {
  addCoInstructor,
  coInstructorAddError,
  coInstructorDisplayName,
  coInstructorUids,
  getDefaultClassValues,
  instructorClassMappingDiff,
  normalizeInstructorEmail,
  removeCoInstructor,
  toFormValues,
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

    // The form mutates this array on every add and remove. Aliasing the
    // stored one would edit the `values` snapshot in place, which is what
    // "Cancel changes" restores from.
    test('toFormValues copies otherInstructorUids rather than aliasing it', () => {
      const cls = getDefaultClassValues()
      cls.otherInstructorUids = ['uid-ada']

      const mapped = toFormValues(cls)
      expect(mapped.otherInstructorUids).toEqual(['uid-ada'])
      expect(mapped.otherInstructorUids).not.toBe(cls.otherInstructorUids)
    })

    // Documents written before the field existed have no array at all.
    test('toFormValues defaults a missing otherInstructorUids to []', () => {
      const cls = getDefaultClassValues()
      delete (cls as Partial<Data.Class>).otherInstructorUids

      expect(toFormValues(cls).otherInstructorUids).toEqual([])
    })
  })

  describe('co-instructor list helpers', () => {
    const ada = {
      uid: 'uid-ada',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      accepted: true,
    }
    const grace = {
      uid: 'uid-grace',
      email: 'grace@example.com',
      firstName: 'Grace',
      lastName: 'Hopper',
      accepted: true,
    }

    test('normalizeInstructorEmail trims and lowercases for lookup', () => {
      expect(normalizeInstructorEmail('  ADA@Example.COM ')).toBe(
        'ada@example.com',
      )
      expect(normalizeInstructorEmail('')).toBe('')
    })

    test('coInstructorDisplayName falls back to the address when unnamed', () => {
      expect(coInstructorDisplayName(ada)).toBe('Ada Lovelace')
      expect(
        coInstructorDisplayName({ ...ada, firstName: '', lastName: '' }),
      ).toBe('ada@example.com')
    })

    test('add appends, and removing by uid takes exactly one out', () => {
      const list = addCoInstructor(addCoInstructor([], ada), grace)
      expect(coInstructorUids(list)).toEqual(['uid-ada', 'uid-grace'])
      expect(coInstructorUids(removeCoInstructor(list, 'uid-ada'))).toEqual([
        'uid-grace',
      ])
    })

    test('add is idempotent, so a double-submit cannot duplicate a row', () => {
      const list = addCoInstructor([ada], ada)
      expect(list).toHaveLength(1)
    })

    // The two things the client can judge on its own. Eligibility is not one
    // of them - only the server can see a decision document.
    test('coInstructorAddError rejects a duplicate and the owner themselves', () => {
      expect(coInstructorAddError([], ada, 'owner-uid')).toBeNull()
      expect(coInstructorAddError([ada], ada, 'owner-uid')).toMatch(
        /already a co-instructor/,
      )
      expect(coInstructorAddError([], ada, 'uid-ada')).toMatch(
        /already this class/,
      )
    })
  })

  describe('instructorClassMappingDiff', () => {
    test('reports only what changed', () => {
      expect(
        instructorClassMappingDiff(['a', 'b'], ['b', 'c'], 'owner'),
      ).toEqual({ added: ['c'], removed: ['a'] })
    })

    test('never adds or revokes the class owner', () => {
      // The owner's mapping is written unconditionally on every save, and
      // they also reach the class through the `${uid}-${n}` ID prefix, so
      // revoking it here would be both wrong and useless.
      expect(
        instructorClassMappingDiff(['owner', 'a'], ['owner'], 'owner'),
      ).toEqual({ added: [], removed: ['a'] })
      expect(instructorClassMappingDiff([], ['owner'], 'owner')).toEqual({
        added: [],
        removed: [],
      })
    })

    test('is empty when nothing moved', () => {
      expect(instructorClassMappingDiff(['a'], ['a'], 'owner')).toEqual({
        added: [],
        removed: [],
      })
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
