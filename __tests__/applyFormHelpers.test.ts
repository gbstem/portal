import type {} from '../src/data.d.ts'
import {
  createEmptyApplication,
  toApplyFormValues,
  normalizeApplicationData,
  buildApplyApiPayload,
} from '$lib/helpers/applyForm'

describe('ApplyForm Helpers', () => {
  describe('createEmptyApplication & normalizeApplicationData', () => {
    test('createEmptyApplication returns default state', () => {
      const app = createEmptyApplication()
      expect(app.personal.email).toBe('')
      expect(app.meta.submitted).toBe(false)
    })

    test('normalizeApplicationData fills user identity information when provided', () => {
      const userObj = { email: 'test@example.com', uid: 'uid123' }
      const userProfile = { firstName: 'Jane', lastName: 'Doe', id: 'prof1' }

      const app = normalizeApplicationData(null, userObj, userProfile)
      expect(app.personal.email).toBe('test@example.com')
      expect(app.personal.firstName).toBe('Jane')
      expect(app.meta.uid).toBe('uid123')
    })
  })

  describe('toApplyFormValues', () => {
    test('maps Data.Application to form values', () => {
      const app = createEmptyApplication()
      app.academic.school = 'Harvard'
      app.program.courses = ['Python 1']

      const formValues = toApplyFormValues(app)
      expect(formValues.academic.school).toBe('Harvard')
      expect(formValues.program.courses).toEqual(['Python 1'])
    })
  })

  describe('buildApplyApiPayload', () => {
    test('constructs API payload for application submit', () => {
      const payload = buildApplyApiPayload('Jane')
      expect(payload).toEqual({ firstName: 'Jane' })
    })
  })
})
