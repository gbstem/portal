// Set timezone to America/New_York so that date formatting tests are deterministic
process.env.TZ = 'America/New_York'

jest.mock('firebase/firestore', () => {
  class MockTimestamp {
    constructor(
      public seconds: number,
      public nanoseconds: number,
    ) {}
    static now() {
      return new MockTimestamp(Date.now() / 1000, 0)
    }
    toDate() {
      return new Date(this.seconds * 1000)
    }
  }
  return {
    doc: jest.fn(),
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    collection: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    arrayUnion: jest.fn((...val) => val),
    Timestamp: MockTimestamp,
  }
})

jest.mock('$lib/stores', () => ({
  alert: {
    trigger: jest.fn(),
  },
}))

jest.mock('$lib/client/firebase', () => ({
  db: {},
}))

jest.mock('$lib/data/constants', () => ({
  classesCollection: 'classes',
}))

import { alert } from '$lib/stores'
import {
  addDataToHtmlTemplate,
  classTodayHeld,
  cleanEnvVar,
  clickOutside,
  cn,
  copyEmails,
  copyToClipboard,
  formatDate,
  formatDateLocal,
  formatDateString,
  formatDateStringLocal,
  formatTime24to12,
  getInstructorClasses,
  htmlToPlainText,
  isClassUpcoming,
  normalizeCapitals,
  timestampToDate,
  toLocalISOString,
  trapFocus,
  updateInstructorClassMappings,
} from '../src/lib/utils'

describe('utils', () => {
  describe('cn', () => {
    it('merges class names correctly', () => {
      expect(cn('class1', 'class2')).toBe('class1 class2')
    })

    it('handles conditional class names', () => {
      expect(cn('class1', false && 'class2', true && 'class3')).toBe(
        'class1 class3',
      )
    })

    it('merges tailwind classes properly using twMerge', () => {
      expect(cn('px-2 py-1', 'p-4')).toBe('p-4')
    })
  })

  describe('clickOutside', () => {
    let node: HTMLDivElement
    let outside: HTMLButtonElement
    let inside: HTMLButtonElement

    beforeEach(() => {
      node = document.createElement('div')
      outside = document.createElement('button')
      inside = document.createElement('button')

      node.appendChild(inside)
      document.body.appendChild(node)
      document.body.appendChild(outside)
    })

    afterEach(() => {
      document.body.removeChild(node)
      document.body.removeChild(outside)
    })

    it('dispatches outclick event when clicked outside', () => {
      const listener = jest.fn()
      node.addEventListener('outclick', listener)

      const action = clickOutside(node)
      outside.click()

      expect(listener).toHaveBeenCalled()
      action.destroy()
    })

    it('does not dispatch outclick event when clicked inside', () => {
      const listener = jest.fn()
      node.addEventListener('outclick', listener)

      const action = clickOutside(node)
      inside.click()

      expect(listener).not.toHaveBeenCalled()
      action.destroy()
    })
  })

  describe('trapFocus', () => {
    let container: HTMLDivElement
    let button1: HTMLButtonElement
    let button2: HTMLButtonElement
    let outsideButton: HTMLButtonElement

    beforeEach(() => {
      container = document.createElement('div')
      button1 = document.createElement('button')
      button2 = document.createElement('button')
      outsideButton = document.createElement('button')

      container.appendChild(button1)
      container.appendChild(button2)
      document.body.appendChild(container)
      document.body.appendChild(outsideButton)
    })

    afterEach(() => {
      document.body.removeChild(container)
      document.body.removeChild(outsideButton)
    })

    it('focuses the first focusable element on initialization', () => {
      outsideButton.focus()
      const action = trapFocus(container)
      expect(document.activeElement).toBe(button1)
      action.destroy()
    })

    it('restores focus to previous element on destroy', () => {
      outsideButton.focus()
      const action = trapFocus(container)
      action.destroy()
      expect(document.activeElement).toBe(outsideButton)
    })

    it('wraps focus on Tab and Shift+Tab keydown', () => {
      const action = trapFocus(container)
      button2.focus()

      let event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false })
      container.dispatchEvent(event)
      expect(document.activeElement).toBe(button1)

      event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })
      container.dispatchEvent(event)
      expect(document.activeElement).toBe(button2)

      action.destroy()
    })
  })

  describe('addDataToHtmlTemplate', () => {
    it('substitutes nested values and handles spaces', () => {
      const html = 'Hello {{  user.name  }}!'
      const template = { data: { user: { name: 'Alice' } } }
      expect(addDataToHtmlTemplate(html, template)).toBe('Hello Alice!')
    })

    it('returns empty string for missing keys', () => {
      const html = 'Hello {{user.age}}!'
      const template = { data: { user: {} } }
      expect(addDataToHtmlTemplate(html, template)).toBe('Hello !')
    })
  })

  describe('formatTime24to12', () => {
    it('formats times correctly', () => {
      expect(formatTime24to12('13:30')).toBe('1:30 PM')
      expect(formatTime24to12('09:05')).toBe('9:05 AM')
    })
  })

  describe('timestampToDate', () => {
    it('converts Firestore Timestamp to Date', () => {
      const mockTimestamp = { seconds: 1779900600 } as any
      expect(timestampToDate(mockTimestamp).getTime()).toBe(1779900600 * 1000)
    })
  })

  describe('classTodayHeld with fake timers', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-05-28T12:00:00-04:00'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('returns true if class was held earlier today', () => {
      const classTime = new Date('2026-05-28T10:00:00-04:00')
      const mockTimestamp = Object.assign(classTime, {
        seconds: classTime.getTime() / 1000,
      })
      const datesHeld = [mockTimestamp] as any
      expect(classTodayHeld(datesHeld)).toBe(true)
    })

    it('returns false if no classes were held today', () => {
      const classTime = new Date('2026-05-27T10:00:00-04:00')
      const mockTimestamp = Object.assign(classTime, {
        seconds: classTime.getTime() / 1000,
      })
      const datesHeld = [mockTimestamp] as any
      expect(classTodayHeld(datesHeld)).toBe(false)
    })
  })

  describe('normalizeCapitals', () => {
    it('normalizes names and handles undefined', () => {
      expect(normalizeCapitals(undefined as any)).toBe('')
      expect(normalizeCapitals('jOhN DoE')).toBe('John Doe')
    })
  })

  describe('date formatters', () => {
    it('formatDateString formats a date string using environment locale', () => {
      expect(formatDateString('2026-05-28T15:30:00')).toBe(
        'Thursday, May 28 at 03:30 PM',
      )
    })

    it('formatDate formats date with short weekday and month representation', () => {
      const date = new Date(2026, 4, 28, 15, 30)
      expect(formatDate(date)).toBe('Thu, May 28, 3:30 PM')
    })

    it('formatDateLocal formats Date with long timezone name', () => {
      const date = new Date(2026, 4, 28, 15, 30)
      expect(formatDateLocal(date)).toBe(
        'Thursday, May 28 at 3:30 PM Eastern Daylight Time',
      )
    })

    it('formatDateStringLocal formats Date string with long timezone name', () => {
      expect(formatDateStringLocal('2026-05-28T15:30:00')).toBe(
        'Thursday, May 28 at 3:30 PM Eastern Daylight Time',
      )
    })

    it('toLocalISOString formats local date components to ISO string format', () => {
      const date = new Date(2026, 4, 28, 15, 30)
      expect(toLocalISOString(date)).toBe('2026-05-28T15:30')
    })
  })

  describe('isClassUpcoming', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-05-28T12:00:00-04:00'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('returns true if class starts within 30 minutes in the future', () => {
      const classDate = new Date(Date.now() + 15 * 60 * 1000)
      expect(isClassUpcoming(classDate)).toBe(true)
    })

    it('returns false if class starts more than 30 minutes in the future or is in the past', () => {
      const classDate = new Date(Date.now() + 45 * 60 * 1000)
      expect(isClassUpcoming(classDate)).toBe(false)
      expect(isClassUpcoming(new Date(Date.now() - 5 * 60 * 1000))).toBe(false)
    })
  })

  describe('htmlToPlainText', () => {
    it('converts basic HTML to plain text', () => {
      const html = '<h1>Hello</h1><p>World</p>'
      expect(htmlToPlainText(html)).toBe('Hello\nWorld')
    })

    it('replaces br elements with newlines', () => {
      const html = 'Line 1<br>Line 2'
      expect(htmlToPlainText(html)).toBe('Line 1\nLine 2')
    })
  })

  describe('copyToClipboard', () => {
    let originalExecCommand: any

    beforeAll(() => {
      originalExecCommand = document.execCommand
      document.execCommand = jest.fn()
    })

    afterAll(() => {
      document.execCommand = originalExecCommand
    })

    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('copies html content as plain text and triggers success alert', () => {
      copyToClipboard('<p>Hello World</p>')
      expect(document.execCommand).toHaveBeenCalledWith('copy')
      expect(alert.trigger).toHaveBeenCalledWith(
        'success',
        'Email copied to clipboard!',
      )
    })
  })

  describe('copyEmails', () => {
    let originalClipboard: any

    beforeAll(() => {
      originalClipboard = { ...navigator.clipboard }
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: jest.fn(),
        },
        writable: true,
        configurable: true,
      })
    })

    afterAll(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      })
    })

    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('filters false-y/blank values, joins them, and triggers success alert', async () => {
      ;(navigator.clipboard.writeText as jest.Mock).mockResolvedValue(undefined)

      copyEmails([
        'test1@example.com',
        '',
        null,
        undefined,
        '  ',
        'test2@example.com',
      ])

      // Wait for promise microtasks
      await new Promise(process.nextTick)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'test1@example.com, test2@example.com',
      )
      expect(alert.trigger).toHaveBeenCalledWith(
        'success',
        'Emails copied to clipboard!',
      )
    })

    it('triggers error alert when email copying fails', async () => {
      ;(navigator.clipboard.writeText as jest.Mock).mockRejectedValue(
        new Error('Permission denied'),
      )

      copyEmails(['test@example.com'])

      // Wait for promise microtasks
      await new Promise(process.nextTick)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'test@example.com',
      )
      expect(alert.trigger).toHaveBeenCalledWith(
        'error',
        'Failed to copy emails to clipboard!',
      )
    })
  })

  describe('Firestore queries', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    describe('getInstructorClasses', () => {
      it('returns co-taught and owned classes mapped correctly with converted timestamps', async () => {
        const mockClass1 = { meetingTimes: [{ seconds: 123456 }] }
        const mockClass2 = { completedClassDates: [{ seconds: 789012 }] }

        const { getDoc, getDocs } = require('firebase/firestore')

        getDoc
          .mockResolvedValueOnce({
            exists: () => true,
            data: () => ({ classIds: ['class1'] }),
          }) // instructorClassesDoc
          .mockResolvedValueOnce({
            exists: () => true,
            data: () => mockClass1,
          }) // classDoc for class1
          .mockResolvedValueOnce({
            exists: () => true,
            data: () => mockClass2,
          }) // classDoc for class2 (owned)

        getDocs.mockResolvedValueOnce({
          forEach: (callback: any) => {
            callback({ id: 'instructorUID-class2' })
          },
        })

        const classes = await getInstructorClasses(
          'instructorUID',
          'email@test.com',
        )
        expect(classes).toEqual({
          class1: { meetingTimes: [new Date(123456000)] },
          'instructorUID-class2': {
            completedClassDates: [new Date(789012000)],
          },
        })
      })

      it('returns empty dictionary if doc fetch throws error', async () => {
        const consoleErrorSpy = jest
          .spyOn(console, 'error')
          .mockImplementation(() => {})
        const { getDoc } = require('firebase/firestore')
        getDoc.mockRejectedValueOnce(new Error('Firestore error'))

        const classes = await getInstructorClasses(
          'instructorUID',
          'email@test.com',
        )
        expect(classes).toEqual({})
        expect(consoleErrorSpy).toHaveBeenCalled()
        consoleErrorSpy.mockRestore()
      })
    })

    describe('updateInstructorClassMappings', () => {
      it('updates main instructor and co-instructors class lists using updateDoc', async () => {
        const { updateDoc } = require('firebase/firestore')
        updateDoc.mockResolvedValue(undefined)

        await updateInstructorClassMappings(
          'class123',
          'main@test.com',
          'co1@test.com, co2@test.com',
        )

        expect(updateDoc).toHaveBeenCalledTimes(3)
      })

      it('falls back to setDoc if updateDoc fails', async () => {
        const { updateDoc, setDoc } = require('firebase/firestore')
        updateDoc.mockRejectedValue(new Error('document does not exist'))
        setDoc.mockResolvedValue(undefined)

        await updateInstructorClassMappings('class123', 'main@test.com', '')

        expect(updateDoc).toHaveBeenCalledTimes(1)
        expect(setDoc).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('cleanEnvVar', () => {
    it('removes double quotes', () => {
      expect(cleanEnvVar('"value"')).toBe('value')
    })

    it('removes single quotes', () => {
      expect(cleanEnvVar("'value'")).toBe('value')
    })

    it('trims whitespace', () => {
      expect(cleanEnvVar('  value  ')).toBe('value')
    })

    it('removes both quotes and whitespace', () => {
      expect(cleanEnvVar('  "value"  ')).toBe('value')
    })

    it('returns empty string for empty input', () => {
      expect(cleanEnvVar('')).toBe('')
    })

    it('returns empty string for undefined', () => {
      expect(cleanEnvVar(undefined)).toBe('')
    })

    it('returns value unchanged if not quoted', () => {
      expect(cleanEnvVar('value')).toBe('value')
    })

    it('handles special characters in value', () => {
      expect(cleanEnvVar('"user-agent: Mozilla..."')).toBe(
        'user-agent: Mozilla...',
      )
    })
  })
})
