/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock(
  'svelte/store',
  () => {
    const get = (store: any) => {
      let value: any
      store.subscribe((v: any) => {
        value = v
      })()
      return value
    }
    const writable = (initialValue: any) => {
      let currentValue = initialValue
      const subscribers = new Set<any>()
      const subscribe = (fn: any) => {
        subscribers.add(fn)
        fn(currentValue)
        return () => {
          subscribers.delete(fn)
        }
      }
      const set = (newValue: any) => {
        currentValue = newValue
        subscribers.forEach((fn) => fn(currentValue))
      }
      const update = (fn: any) => {
        set(fn(currentValue))
      }
      return { subscribe, set, update }
    }
    return { get, writable }
  },
  { virtual: true },
)

jest.mock(
  'lodash-es',
  () => ({
    capitalize: (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
    lowerCase: (str: string) => str.replace(/[-_]/g, ' ').toLowerCase(),
  }),
  { virtual: true },
)

import { get } from 'svelte/store'
import { alert, dialog, selectedStudentId } from '../src/lib/stores'

describe('stores', () => {
  beforeEach(() => {
    alert.clear()
    dialog.set(null)
    selectedStudentId.set('')
  })

  describe('alert store', () => {
    it('initializes with default state', () => {
      const state = get(alert)
      expect(state).toEqual({
        type: null,
        message: '',
        timestamp: null,
      })
    })

    it('triggers a success alert', () => {
      alert.trigger('success', 'Success message')
      const state = get(alert)
      expect(state.type).toBe('success')
      expect(state.message).toBe('Success message')
      expect(state.timestamp).toBeInstanceOf(Date)
    })

    it('triggers an error alert without auto formatting', () => {
      alert.trigger('error', 'Error message')
      const state = get(alert)
      expect(state.type).toBe('error')
      expect(state.message).toBe('Error message')
    })

    it('triggers an error alert with auto formatting (simple message)', () => {
      alert.trigger('error', 'some_error_message', true)
      const state = get(alert)
      expect(state.type).toBe('error')
      expect(state.message).toBe('Some error message.')
    })

    it('triggers an error alert with auto formatting (slash message)', () => {
      alert.trigger('error', 'auth/user-not-found', true)
      const state = get(alert)
      expect(state.type).toBe('error')
      expect(state.message).toBe('User not found.')
    })

    it('clears the alert', () => {
      alert.trigger('success', 'Success message')
      alert.clear()
      const state = get(alert)
      expect(state).toEqual({
        type: null,
        message: '',
        timestamp: null,
      })
    })
  })

  describe('dialog store', () => {
    it('is a writable store', () => {
      expect(get(dialog)).toBeNull()
      dialog.set('test-dialog')
      expect(get(dialog)).toBe('test-dialog')
    })
  })

  describe('selectedStudentId store', () => {
    it('is a writable store', () => {
      expect(get(selectedStudentId)).toBe('')
      selectedStudentId.set('student-123')
      expect(get(selectedStudentId)).toBe('student-123')
    })
  })
})
