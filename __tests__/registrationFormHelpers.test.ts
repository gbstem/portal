import type {} from '../src/data.d.ts'
import {
  createBootstrapRegistration,
  createEmptyRegistration,
  normalizeRegistrationData,
  toRegistrationFormValues,
  buildRegistrationApiPayload,
} from '$lib/helpers/registrationForm'

describe('RegistrationForm Helpers', () => {
  describe('createEmptyRegistration & normalizeRegistrationData', () => {
    test('createEmptyRegistration creates full empty default structure', () => {
      const reg = createEmptyRegistration()
      expect(reg.personal.studentFirstName).toBe('')
      expect(reg.agreements.mediaRelease).toBe(false)
      expect(reg.meta.submitted).toBe(false)
    })

    test('normalizeRegistrationData merges partial Firestore document safely', () => {
      const partial = {
        personal: { studentFirstName: 'Johnny', email: 'johnny@example.com' },
        meta: { submitted: true },
      }

      const normalized = normalizeRegistrationData(partial)
      expect(normalized.personal.studentFirstName).toBe('Johnny')
      expect(normalized.personal.email).toBe('johnny@example.com')
      expect(normalized.personal.parentFirstName).toBe('') // Default preserved
      expect(normalized.meta.submitted).toBe(true)
    })

    test('normalizeRegistrationData returns clean empty structure on null input', () => {
      const normalized = normalizeRegistrationData(null)
      expect(normalized.personal.studentFirstName).toBe('')
    })
  })

  describe('createBootstrapRegistration', () => {
    // Stands in for the serverTimestamp() sentinel the component passes.
    const SENTINEL = { _methodName: 'serverTimestamp' } as any

    test('stamps timestamps.created so a new draft is never written with a null', () => {
      // The regression this guards: createEmptyRegistration() returns
      // `created: null`, and the bootstrap used to write that straight to
      // Firestore, leaving admin's `timestamps.created.toDate()` to crash on it.
      expect(createEmptyRegistration().timestamps.created).toBeNull()

      const reg = createBootstrapRegistration(
        'parentUid-1',
        'Ada',
        'Lovelace',
        'ada@example.com',
        SENTINEL,
      )
      expect(reg.timestamps.created).toBe(SENTINEL)
      expect(reg.timestamps.updated).toBe(SENTINEL)
    })

    test('pins the child slot uid and the parent identity fields', () => {
      const reg = createBootstrapRegistration(
        'parentUid-2',
        'Ada',
        'Lovelace',
        'ada@example.com',
        SENTINEL,
      )
      expect(reg.meta.uid).toBe('parentUid-2')
      expect(reg.personal.parentFirstName).toBe('Ada')
      expect(reg.personal.parentLastName).toBe('Lovelace')
      expect(reg.personal.email).toBe('ada@example.com')
    })

    test('leaves the rest of the default shape intact', () => {
      // admin's dashboard filters on meta.submitted, so the whole default shape
      // still has to go out on this first write.
      const reg = createBootstrapRegistration('uid-1', '', '', '', SENTINEL)
      expect(reg.meta.submitted).toBe(false)
      expect(reg.personal.studentFirstName).toBe('')
      expect(reg.agreements.mediaRelease).toBe(false)
      expect(reg.academic.school).toBe('')
    })

    test('returns an independent object per call', () => {
      const a = createBootstrapRegistration(
        'uid-1',
        'A',
        'B',
        'a@x.com',
        SENTINEL,
      )
      const b = createBootstrapRegistration(
        'uid-2',
        'C',
        'D',
        'c@x.com',
        SENTINEL,
      )
      a.personal.studentFirstName = 'mutated'
      expect(b.personal.studentFirstName).toBe('')
      expect(b.meta.uid).toBe('uid-2')
    })
  })

  describe('toRegistrationFormValues', () => {
    test('maps Data.Registration to form fields', () => {
      const reg = createEmptyRegistration()
      reg.personal.studentFirstName = 'Johnny'
      reg.personal.studentLastName = 'Appleseed'
      reg.academic.school = 'Lincoln'
      reg.program.csCourse = 'Python 1'

      const formVal = toRegistrationFormValues(reg)
      expect(formVal.personal.studentFirstName).toBe('Johnny')
      expect(formVal.academic.school).toBe('Lincoln')
      expect(formVal.program.csCourse).toBe('Python 1')
    })
  })

  describe('buildRegistrationApiPayload', () => {
    test('builds registration API payload correctly', () => {
      const payload = buildRegistrationApiPayload(
        'Sarah',
        'Johnny',
        'May 20, 2026',
        'sarah@example.com',
      )
      expect(payload).toEqual({
        firstName: 'Sarah',
        studentName: 'Johnny',
        parentOrientationDate: 'May 20, 2026',
        secondaryEmail: 'sarah@example.com',
      })
    })
  })
})
