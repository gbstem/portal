import type {} from '../src/data.d.ts'
import {
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
