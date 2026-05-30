/* eslint-disable @typescript-eslint/no-explicit-any */

;(global as any).Response = class MockResponse {
  constructor(
    public body: any,
    public init: any,
  ) {}
}

// Mock Svelte Store reset
jest.mock(
  'svelte/store',
  () => ({
    writable: (val: any) => ({
      subscribe: (fn: any) => {
        fn(val)
        return () => {}
      },
      set: () => {},
      update: () => {},
    }),
    readable: (val: any) => ({
      subscribe: (fn: any) => {
        fn(val)
        return () => {}
      },
    }),
    get: (store: any) => {
      let val: any
      store.subscribe((v: any) => {
        val = v
      })()
      return val
    },
  }),
  { virtual: true },
)

// Mock SvelteKit
jest.mock(
  '@sveltejs/kit',
  () => ({
    error: (status: number, message: any) => ({
      status,
      message,
      __isSvelteKitError: true,
    }),
    redirect: (status: number, location: string) => ({
      status,
      location,
      __isSvelteKitRedirect: true,
    }),
    json: (body: any, init?: any) => ({ body, init, __isSvelteKitJson: true }),
  }),
  { virtual: true },
)

// Mock lodash-es
jest.mock(
  'lodash-es',
  () => ({
    capitalize: (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
    lowerCase: (str: string) => str.replace(/[-_]/g, ' ').toLowerCase(),
  }),
  { virtual: true },
)

// Mock firebase-admin
const mockAdminAuth = {
  verifyIdToken: jest.fn(),
  createSessionCookie: jest.fn(),
  verifySessionCookie: jest.fn(),
  getUser: jest.fn(),
  setCustomUserClaims: jest.fn(),
  generateEmailVerificationLink: jest.fn().mockResolvedValue('http://link'),
  generateVerifyAndChangeEmailLink: jest.fn().mockResolvedValue('http://link'),
  generatePasswordResetLink: jest.fn().mockResolvedValue('http://link'),
}

const mockDoc = (id = 'id123') => ({
  id,
  exists: true,
  data: () => ({ html: 'Hello {{action.link}}' }),
  get: jest.fn().mockResolvedValue({
    exists: true,
    data: () => ({ html: 'Hello {{action.link}}' }),
  }),
})

const mockCollection = {
  get: jest.fn().mockResolvedValue({
    docs: [
      {
        id: 'doc1',
        data: () => ({}),
      },
    ],
  }),
  doc: jest.fn().mockImplementation((id) => mockDoc(id)),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  startAfter: jest.fn().mockReturnThis(),
}

const mockAdminDb = {
  collection: jest.fn().mockReturnValue(mockCollection),
  doc: jest.fn().mockImplementation((id) => mockDoc(id)),
}

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
}))

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => mockAdminAuth),
}))

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockAdminDb),
}))

// Mock verifyToken from $lib/server/firebase
jest.mock('$lib/server/firebase', () => ({
  adminAuth: mockAdminAuth,
  adminDb: mockAdminDb,
}))

// Mocks for firebase/app, auth, firestore, storage
jest.mock('firebase/app', () => ({ initializeApp: jest.fn() }))
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  onAuthStateChanged: jest.fn(),
}))
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  collection: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  arrayUnion: jest.fn((...val) => val),
  Timestamp: class {
    constructor(
      public seconds: number,
      public nanoseconds: number,
    ) {}
    toDate() {
      return new Date(this.seconds * 1000)
    }
  },
}))
jest.mock('firebase/storage', () => ({ getStorage: jest.fn() }))

// Import routes
import { handle } from '../src/hooks.server'
import { load as emailVerifiedLayoutLoad } from '../src/routes/(signedIn)/(emailVerified)/+layout.server'
import { load as signedInLayoutLoad } from '../src/routes/(signedIn)/+layout.server'
import { load as signedOutLayoutLoad } from '../src/routes/(signedOut)/+layout.server'
import { load as pageLoad } from '../src/routes/+page'

import { POST as actionPOST } from '../src/routes/api/action/+server'
import { POST as applicationPOST } from '../src/routes/api/application/+server'
import {
  DELETE as authDELETE,
  POST as authPOST,
} from '../src/routes/api/auth/+server'
import { POST as communityServicePOST } from '../src/routes/api/communityService/+server'
import { POST as enrollPOST } from '../src/routes/api/enroll/+server'
import { POST as interviewPOST } from '../src/routes/api/interview/+server'
import { POST as registrationPOST } from '../src/routes/api/registration/+server'
import { POST as remindStudentsPOST } from '../src/routes/api/remindStudents/+server'
import { POST as slotRequestPOST } from '../src/routes/api/slotRequest/+server'
import { POST as substitutePOST } from '../src/routes/api/substitute/+server'
import { POST as tokenPOST } from '../src/routes/api/token/+server'

describe('hooks.server.ts handle', () => {
  let event: any
  let resolve: any

  beforeEach(() => {
    event = {
      cookies: {
        get: jest.fn(),
      },
      locals: {},
    }
    resolve = jest.fn().mockResolvedValue('resolved-response')
  })

  it('resolves handle successfully for student', async () => {
    event.cookies.get.mockReturnValue('sessionCookie123')
    mockAdminAuth.verifySessionCookie.mockResolvedValue({ uid: 'uid123' })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      email: 'student@test.com',
      emailVerified: true,
      customClaims: { role: 'student' },
    })

    const res = await handle({ event, resolve } as any)
    expect(res).toBe('resolved-response')
  })

  it('redirects if user is admin (needs to go to admin portal)', async () => {
    event.cookies.get.mockReturnValue('sessionCookie123')
    mockAdminAuth.verifySessionCookie.mockResolvedValue({ uid: 'uid123' })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      email: 'admin@test.com',
      emailVerified: true,
      customClaims: { role: 'admin' },
    })

    await expect(handle({ event, resolve } as any)).rejects.toEqual(
      expect.objectContaining({
        __isSvelteKitRedirect: true,
        location: 'https://admin.gbstem.org',
      }),
    )
  })
})

describe('layout and page load tests', () => {
  it('+page.ts load throws redirect', () => {
    expect(() => pageLoad()).toThrow(
      expect.objectContaining({ __isSvelteKitRedirect: true }),
    )
  })

  it('signedIn layout load redirects if no user', () => {
    expect(() => signedInLayoutLoad({ locals: { user: null } } as any)).toThrow(
      expect.objectContaining({ __isSvelteKitRedirect: true }),
    )
  })

  it('emailVerified layout load redirects if user email not verified', async () => {
    const parent = jest.fn().mockResolvedValue({})
    await expect(
      emailVerifiedLayoutLoad({
        parent,
        locals: { user: { emailVerified: false } },
      } as any),
    ).rejects.toEqual(expect.objectContaining({ __isSvelteKitRedirect: true }))
  })

  it('signedOut layout load redirects if user logged in', () => {
    expect(() =>
      signedOutLayoutLoad({ locals: { user: { role: 'student' } } } as any),
    ).toThrow(expect.objectContaining({ __isSvelteKitRedirect: true }))
  })
})

describe('API routes POST endpoints', () => {
  let mockRequest: any
  let mockCookies: any

  beforeEach(() => {
    mockRequest = {
      json: jest.fn(),
    }
    mockCookies = {
      set: jest.fn(),
      delete: jest.fn(),
    }
  })

  it('actionPOST verifyEmail successfully', async () => {
    mockRequest.json.mockResolvedValue({
      type: 'verifyEmail',
      email: 'test@test.com',
    })
    const res = await actionPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('applicationPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({ firstName: 'Student' })
    const res = await applicationPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('authPOST POST and DELETE successfully', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.createSessionCookie.mockResolvedValue('sessionCookieVal')

    const res = await authPOST({
      request: mockRequest,
      cookies: mockCookies,
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))

    const delRes = await authDELETE({ cookies: mockCookies } as any)
    expect(delRes).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('communityServicePOST successfully', async () => {
    mockRequest.json.mockResolvedValue({ name: 'Student' })
    const res = await communityServicePOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('enrollPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({
      email: 'student@test.com',
      firstName: 'Student',
      instructor: 'Instructor',
      instructorEmail: 'inst@test.com',
      classTimes: ['14:00', '16:00'],
      classDays: ['Monday', 'Wednesday'],
      course: 'Math',
      studentName: 'StudentFull',
      online: true,
    })
    const res = await enrollPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('interviewPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({ name: 'Student' })
    const res = await interviewPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('registrationPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({ name: 'Student' })
    const res = await registrationPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('remindStudentsPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({
      name: 'Student',
      email: 'student@test.com',
      instructorName: 'Instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorEmails: '',
      class: 'Math',
      classTime: 'Monday at 2:00 PM',
    })
    const res = await remindStudentsPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('slotRequestPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({ name: 'Student' })
    const res = await slotRequestPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('substitutePOST successfully', async () => {
    mockRequest.json.mockResolvedValue({ name: 'Student' })
    const res = await substitutePOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('tokenPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({ name: 'Student' })
    const res = await tokenPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toBeInstanceOf(Response)
  })
})
