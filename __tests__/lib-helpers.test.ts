// Mock Svelte Stores
const readableResets: Array<() => void> = []

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
    const readable = (initialValue: any, start: any) => {
      let currentValue = initialValue
      const subscribers = new Set<any>()
      let stop: any = null
      const subscribe = (fn: any) => {
        subscribers.add(fn)
        fn(currentValue)
        if (subscribers.size === 1 && start) {
          stop = start((newValue: any) => {
            currentValue = newValue
            subscribers.forEach((f) => f(currentValue))
          })
        }
        return () => {
          subscribers.delete(fn)
          if (subscribers.size === 0 && stop) {
            stop()
          }
        }
      }
      readableResets.push(() => {
        currentValue = initialValue
      })
      return { subscribe }
    }
    return { get, writable, readable }
  },
  { virtual: true },
)

// Mock firebase/app
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
}))

// Mock firebase/auth
let authStateChangedCallback: any = null
const mockAuth = {
  currentUser: null,
}
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => mockAuth),
  onAuthStateChanged: jest.fn((authObj: any, callback: any) => {
    authStateChangedCallback = callback
    return jest.fn() // unsubscribe
  }),
}))

// Mock firebase/firestore
const mockUserDoc = {
  exists: () => true,
  data: () => ({ role: 'student' }),
}
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
    getFirestore: jest.fn(),
    doc: jest.fn(),
    getDoc: jest.fn().mockResolvedValue(mockUserDoc),
    getDocs: jest.fn(),
    collection: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    arrayUnion: jest.fn((...val: any[]) => val),
    Timestamp: MockTimestamp,
  }
})

// Mock firebase/storage
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(),
}))

// Mock firebase-admin
const mockAdminAuth = {
  verifyIdToken: jest.fn(),
  createSessionCookie: jest.fn(),
  verifySessionCookie: jest.fn(),
  getUser: jest.fn(),
  setCustomUserClaims: jest.fn(),
}
const mockAdminDb = {
  collection: jest.fn(),
}
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
}))

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => mockAdminAuth),
}))

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockAdminDb),
}))

// Mock lodash-es
jest.mock(
  'lodash-es',
  () => ({
    capitalize: (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
    lowerCase: (str: string) => str.replace(/[-_]/g, ' ').toLowerCase(),
  }),
  { virtual: true },
)

// Mock $lib/stores
jest.mock('$lib/stores', () => ({
  alert: {
    trigger: jest.fn(),
  },
}))

// Import dependencies to test
import { alert } from '$lib/stores'
import { user } from '../src/lib/client/firebase'
import { curriculums } from '../src/lib/components/helpers/curriculum'
import { generateCurriculumLink } from '../src/lib/components/helpers/curriculumLink'
import generateMeetingTimeChangeEmail from '../src/lib/components/helpers/generateMeetingTimeChangeEmail'
import sendClassReminder from '../src/lib/components/helpers/sendClassReminder'

// Import email templates
import { actionEmailTemplate } from '../src/lib/data/emailTemplates/actionEmailTemplate'
import { applicationSubmittedEmailTemplate } from '../src/lib/data/emailTemplates/applicationSubmittedEmailTemplate'
import { classReminderEmailTemplate } from '../src/lib/data/emailTemplates/classReminderEmailTemplate'
import { communityServiceEmailTemplate } from '../src/lib/data/emailTemplates/communityServiceEmailTemplate'
import { inPersonClassEnrolledEmailTemplate } from '../src/lib/data/emailTemplates/inPersonClassEnrolledEmailTemplate'
import { interviewRequestedEmailTemplate } from '../src/lib/data/emailTemplates/interviewRequestedEmailTemplate'
import { interviewScheduledEmailTemplate } from '../src/lib/data/emailTemplates/interviewScheduledEmailTemplate'
import { onlineClassEnrolledEmailTemplate } from '../src/lib/data/emailTemplates/onlineClassEnrolledEmailTemplate'
import { registrationSubmittedEmailTemplate } from '../src/lib/data/emailTemplates/registrationSubmittedEmailTemplate'
import { substituteClassEmailTemplate } from '../src/lib/data/emailTemplates/substituteClassEmailTemplate'
;(global as any).Student = {}
;(global as any).Curriculum = {}

import '../src/lib/components/types/Curriculum'
import '../src/lib/components/types/Student'
import '../src/lib/data/collections'
import '../src/lib/data/index'
import '../src/lib/server/firebase'

describe('curriculum', () => {
  it('defines curriculums list', () => {
    expect(curriculums.length).toBeGreaterThan(0)
  })

  it('generateCurriculumLink generates valid urls', () => {
    expect(generateCurriculumLink('Mathematics 1a')).toBe(
      'https://curriculum.gbstem.org/math/math1A',
    )
    expect(generateCurriculumLink('Web Development A')).toBe(
      'https://curriculum.gbstem.org/cs/webdev A',
    )
    expect(generateCurriculumLink('Environmental Science A')).toBe(
      'https://curriculum.gbstem.org/science/environmental A',
    )
    expect(generateCurriculumLink('Physics A')).toBe(
      'https://curriculum.gbstem.org/science/physicsA',
    )
    expect(generateCurriculumLink('Engineering 1a')).toBe(
      'https://curriculum.gbstem.org/engineering/engineering1A',
    )
  })
})

describe('generateMeetingTimeChangeEmail', () => {
  it('returns empty string if no changes', () => {
    expect(generateMeetingTimeChangeEmail([], [])).toBe('')
  })

  it('returns html email body if there are additions and deletions', () => {
    const orig = ['2026-05-28T15:30:00']
    const edited = ['2026-05-29T10:00:00']
    const email = generateMeetingTimeChangeEmail(orig, edited)
    expect(email).toContain('Dear gbSTEM Parents')
    expect(email).toContain('Classes Added')
    expect(email).toContain('Classes Removed')
  })
})

describe('sendClassReminder', () => {
  let originalConfirm: any
  let originalFetch: any

  beforeAll(() => {
    originalConfirm = global.confirm
    originalFetch = global.fetch
  })

  afterAll(() => {
    global.confirm = originalConfirm
    global.fetch = originalFetch
  })

  beforeEach(() => {
    global.confirm = jest.fn()
    global.fetch = jest.fn()
    jest.clearAllMocks()
  })

  it('sends student reminders successfully', async () => {
    ;(global.confirm as jest.Mock).mockReturnValue(true)
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    sendClassReminder({
      studentList: [{ name: 'john doe', email: 'john@test.com' }] as any,
      instructorName: 'test instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorEmails: '',
      className: 'Math',
      nextMeetingTime: 'Monday at 2:00 PM',
    })

    expect(global.confirm).toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await new Promise(process.nextTick)
    expect(alert.trigger).toHaveBeenCalledWith(
      'success',
      'Reminder emails were sent!',
    )
  })

  it('handles single student send successfully', async () => {
    ;(global.confirm as jest.Mock).mockReturnValue(true)
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    sendClassReminder({
      studentList: [{ name: 'john doe', email: 'john@test.com' }] as any,
      studentName: 'john doe',
      studentEmail: 'john@test.com',
      instructorName: 'test instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorEmails: '',
      className: 'Math',
      nextMeetingTime: 'Monday at 2:00 PM',
    })

    await new Promise(process.nextTick)
    expect(alert.trigger).toHaveBeenCalledWith(
      'success',
      'Reminder email was sent to john doe!',
    )
  })
})

describe('client firebase user store', () => {
  let storeSet: any
  let originalLocalStorage: any

  beforeAll(() => {
    originalLocalStorage = global.localStorage
    const storageMock: any = {}
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: (key: string) => storageMock[key] || null,
        setItem: (key: string, val: string) => {
          storageMock[key] = val
        },
        clear: () => {
          for (const key in storageMock) {
            delete storageMock[key]
          }
        },
      },
      writable: true,
    })
  })

  afterAll(() => {
    Object.defineProperty(global, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    })
  })

  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
    readableResets.forEach((reset) => reset())
  })

  afterEach(async () => {
    await new Promise(process.nextTick)
  })

  it('subscribes and updates on login', async () => {
    const unsub = user.subscribe((val) => {
      storeSet = val
    })

    const mockUserObj = {
      uid: 'user123',
      email: 'user@test.com',
      emailVerified: true,
    }

    authStateChangedCallback(mockUserObj)

    await new Promise(process.nextTick)

    expect(storeSet).toEqual({
      object: mockUserObj,
      profile: { role: 'student' },
    })

    unsub()
  })

  it('handles logout', () => {
    const unsub = user.subscribe((val) => {
      storeSet = val
    })

    authStateChangedCallback(null)

    expect(storeSet).toBeNull()
    unsub()
  })
})

describe('email templates', () => {
  it('templates load as strings', () => {
    expect(actionEmailTemplate).toContain('<!doctype html>')
    expect(applicationSubmittedEmailTemplate).toContain('<!doctype html>')
    expect(classReminderEmailTemplate).toContain('<!doctype html>')
    expect(communityServiceEmailTemplate).toContain('<!doctype html>')
    expect(inPersonClassEnrolledEmailTemplate).toContain('<!doctype html>')
    expect(interviewRequestedEmailTemplate).toContain('<!doctype html>')
    expect(interviewScheduledEmailTemplate).toContain('<!doctype html>')
    expect(onlineClassEnrolledEmailTemplate).toContain('<!doctype html>')
    expect(registrationSubmittedEmailTemplate).toContain('<!doctype html>')
    expect(substituteClassEmailTemplate).toContain('<!doctype html>')
  })
})
