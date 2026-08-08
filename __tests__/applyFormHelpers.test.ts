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
      expect(app.meta.decided).toBe(false)
    })

    test('normalizeApplicationData fills user identity information when provided', () => {
      const userObj = { email: 'test@example.com', uid: 'uid123' }
      const userProfile = { firstName: 'Jane', lastName: 'Doe' }

      const app = normalizeApplicationData(null, userObj, userProfile)
      expect(app.personal.email).toBe('test@example.com')
      expect(app.personal.firstName).toBe('Jane')
      expect(app.meta.uid).toBe('uid123')
      // The uid is the only identifier stamped on an application.
      expect(app.meta).not.toHaveProperty('id')
    })

    test('normalizeApplicationData defaults meta.decided for a legacy doc missing the field', () => {
      // A draft written before meta.decided existed has no such field at
      // all - normalize should fill it in via the meta-specific deep merge,
      // not silently drop it via the flat top-level spread.
      const legacyDoc = {
        personal: { email: 'legacy@example.com' },
        meta: { uid: 'uid456', submitted: true },
      }

      const app = normalizeApplicationData(legacyDoc)
      expect(app.meta.decided).toBe(false)
      expect(app.meta.submitted).toBe(true)
      expect(app.meta.uid).toBe('uid456')
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
