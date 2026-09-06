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
    isHttpError: (err: any) =>
      err && (err.__isSvelteKitError || (err.status && err.body)),
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
  getUsers: jest.fn().mockResolvedValue({ users: [], notFound: [] }),
  getUserByEmail: jest.fn(),
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
import { POST as lookupCoInstructorPOST } from '../src/routes/api/lookupCoInstructor/+server'
import { NOT_AN_ACCEPTED_INSTRUCTOR } from '$lib/server/instructorDirectory'
import { decisionsCollection } from '$lib/data/collections'
import { POST as remindStudentsPOST } from '../src/routes/api/remindStudents/+server'
import { POST as resolveCoInstructorsPOST } from '../src/routes/api/resolveCoInstructors/+server'
import { POST as slotRequestPOST } from '../src/routes/api/slotRequest/+server'
import { POST as substitutePOST } from '../src/routes/api/substitute/+server'
import { POST as tokenPOST } from '../src/routes/api/token/+server'
import MailService from '@sendgrid/mail'

// Shared helper for exercising the `catch (mailError)` branch that every
// authenticated POST /api/* route has around its `sendEmail(...)` call -
// none of the route tests below covered it before. `MailService.send` is
// swapped for a rejecting mock just for the duration of `fn`, then restored.
async function withRejectedSend(fn: () => Promise<void>) {
  ;(MailService.send as jest.Mock).mockRejectedValueOnce(
    new Error('SendGrid down'),
  )
  await fn()
}

describe('co-instructor directory routes', () => {
  let mockRequest: any

  /**
   * Points every adminDb.doc() read at `docs`, so a test can say who is an
   * accepted instructor. Anything unlisted reads as a missing document.
   */
  function mockFirestoreDocs(docs: Record<string, any>) {
    mockAdminDb.doc.mockImplementation((path: string) => ({
      get: async () => ({ exists: path in docs, data: () => docs[path] }),
    }))
  }

  const acceptedCaller = {
    [`${decisionsCollection}/caller-uid`]: { type: 'accepted' },
  }
  const instructorLocals = {
    user: { uid: 'caller-uid', email: 'caller@gbstem.org', role: 'instructor' },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequest = { json: jest.fn() }
    mockFirestoreDocs({})
  })

  afterEach(() => {
    mockAdminDb.doc.mockImplementation((id: string) => mockDoc(id))
  })

  describe('lookupCoInstructorPOST', () => {
    it('returns the identity of an accepted instructor', async () => {
      mockFirestoreDocs({
        ...acceptedCaller,
        'users/uid-ada': { firstName: 'Ada', lastName: 'Lovelace' },
        [`${decisionsCollection}/uid-ada`]: { type: 'accepted' },
      })
      mockAdminAuth.getUserByEmail.mockResolvedValue({
        uid: 'uid-ada',
        email: 'ada@gbstem.org',
        customClaims: { role: 'instructor' },
      })
      mockRequest.json.mockResolvedValue({ email: 'ada@gbstem.org' })

      const res: any = await lookupCoInstructorPOST({
        request: mockRequest,
        locals: instructorLocals,
      } as any)

      expect(res.body.instructor).toMatchObject({
        uid: 'uid-ada',
        accepted: true,
      })
    })

    // The business rule: an instructor-role account is not enough, because
    // the role claim is set at signup, long before any interview.
    it('refuses an instructor who has not been accepted', async () => {
      mockFirestoreDocs({
        ...acceptedCaller,
        [`${decisionsCollection}/uid-ada`]: { type: 'rejected' },
      })
      mockAdminAuth.getUserByEmail.mockResolvedValue({
        uid: 'uid-ada',
        email: 'ada@gbstem.org',
        customClaims: { role: 'instructor' },
      })
      mockRequest.json.mockResolvedValue({ email: 'ada@gbstem.org' })

      await expect(
        lookupCoInstructorPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 404 }))
    })

    // Same message and status for "no account" as for "not accepted", so this
    // can't be used to find out whether an address has a gbSTEM account.
    it('gives the same 404 for an address with no account at all', async () => {
      mockFirestoreDocs(acceptedCaller)
      mockAdminAuth.getUserByEmail.mockRejectedValue(new Error('not found'))
      mockRequest.json.mockResolvedValue({ email: 'nobody@example.com' })

      await expect(
        lookupCoInstructorPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 404,
          message: NOT_AN_ACCEPTED_INSTRUCTOR,
        }),
      )
    })

    it('rejects a signed-in student with a 403', async () => {
      mockRequest.json.mockResolvedValue({ email: 'ada@gbstem.org' })

      await expect(
        lookupCoInstructorPOST({
          request: mockRequest,
          locals: { user: { uid: 's-1', role: 'student' } },
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
    })

    // Narrows the "is this address an accepted instructor" oracle to the only
    // people who can use the feature at all.
    it('rejects an instructor who is not themselves accepted', async () => {
      mockFirestoreDocs({})
      mockRequest.json.mockResolvedValue({ email: 'ada@gbstem.org' })

      await expect(
        lookupCoInstructorPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
    })

    it('propagates a 401 when nobody is signed in', async () => {
      mockRequest.json.mockResolvedValue({ email: 'ada@gbstem.org' })

      await expect(
        lookupCoInstructorPOST({ request: mockRequest, locals: {} } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 401 }))
    })
  })

  describe('resolveCoInstructorsPOST', () => {
    it('expands stored uids and omits ones whose account is gone', async () => {
      mockFirestoreDocs({
        'users/uid-ada': { firstName: 'Ada', lastName: 'Lovelace' },
        [`${decisionsCollection}/uid-ada`]: { type: 'accepted' },
      })
      mockAdminAuth.getUsers.mockResolvedValue({
        users: [
          {
            uid: 'uid-ada',
            email: 'ada@gbstem.org',
            customClaims: { role: 'instructor' },
          },
        ],
        notFound: [{ uid: 'uid-deleted' }],
      })
      mockRequest.json.mockResolvedValue({ uids: ['uid-ada', 'uid-deleted'] })

      const res: any = await resolveCoInstructorsPOST({
        request: mockRequest,
        locals: instructorLocals,
      } as any)

      expect(res.body.instructors).toHaveLength(1)
      expect(res.body.instructors[0]).toMatchObject({ uid: 'uid-ada' })
    })

    it('rejects a signed-in student with a 403', async () => {
      mockRequest.json.mockResolvedValue({ uids: ['uid-ada'] })

      await expect(
        resolveCoInstructorsPOST({
          request: mockRequest,
          locals: { user: { uid: 's-1', role: 'student' } },
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
    })
  })
})

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

  it('actionPOST changeEmail successfully', async () => {
    mockRequest.json.mockResolvedValue({
      type: 'changeEmail',
      newEmail: 'new@test.com',
      firstName: 'Student',
    })
    const res = await actionPOST({
      request: mockRequest as any,
      locals: { user: { email: 'old@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.generateVerifyAndChangeEmailLink).toHaveBeenCalledWith(
      'old@test.com',
      'new@test.com',
    )
  })

  it('actionPOST changeEmail fails without a newEmail', async () => {
    mockRequest.json.mockResolvedValue({ type: 'changeEmail' })
    await expect(
      actionPOST({
        request: mockRequest as any,
        locals: { user: { email: 'old@test.com' } },
      } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 400,
        message: 'Invalid request body.',
      }),
    )
  })

  it('actionPOST resetPassword successfully', async () => {
    mockRequest.json.mockResolvedValue({
      type: 'resetPassword',
      email: 'test@test.com',
    })
    const res = await actionPOST({
      request: mockRequest as any,
      locals: {},
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.generatePasswordResetLink).toHaveBeenCalledWith(
      'test@test.com',
    )
  })

  it('actionPOST resetPassword fails without an email', async () => {
    mockRequest.json.mockResolvedValue({ type: 'resetPassword' })
    await expect(
      actionPOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 400,
        message: 'Email is required for password reset.',
      }),
    )
  })

  it('actionPOST fails for an unrecognized action type', async () => {
    mockRequest.json.mockResolvedValue({ type: 'notARealType' })
    await expect(
      actionPOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 400, message: 'Invalid action type.' }),
    )
  })

  it('actionPOST returns a 500 json response when sending the email fails', async () => {
    mockRequest.json.mockResolvedValue({
      type: 'verifyEmail',
      email: 'test@test.com',
    })
    ;(MailService.send as jest.Mock).mockRejectedValueOnce(
      new Error('SendGrid down'),
    )

    const res = await actionPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)

    expect(res).toEqual(
      expect.objectContaining({
        body: { error: 'Failed to send email. Please try again later.' },
        init: { status: 500 },
      }),
    )
  })

  it('actionPOST propagates the auth error when the user is not signed in', async () => {
    mockRequest.json.mockResolvedValue({
      type: 'verifyEmail',
      email: 'test@test.com',
    })
    await expect(
      actionPOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        __isSvelteKitError: true,
      }),
    )
  })

  it('applicationPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({ firstName: 'Student' })
    const res = await applicationPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('applicationPOST returns a 500 json response when sending the email fails', async () => {
    await withRejectedSend(async () => {
      mockRequest.json.mockResolvedValue({ firstName: 'Student' })
      const res = await applicationPOST({
        request: mockRequest as any,
        locals: { user: { email: 'test@test.com' } },
      } as any)
      expect(res).toEqual(
        expect.objectContaining({
          body: { error: 'Failed to send email. Please try again later.' },
          init: { status: 500 },
        }),
      )
    })
  })

  it('applicationPOST propagates the auth error when the user is not signed in', async () => {
    mockRequest.json.mockResolvedValue({ firstName: 'Student' })
    await expect(
      applicationPOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 401, __isSvelteKitError: true }),
    )
  })

  it('authPOST POST and DELETE successfully', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      customClaims: { role: 'student' },
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

  it('authPOST fails if user is admin', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      customClaims: { role: 'admin' },
    })

    await expect(
      authPOST({
        request: mockRequest,
        cookies: mockCookies,
      } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'Admins must sign in on the admin site.',
      }),
    )
  })

  it('authPOST fails if user is reviewer', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      customClaims: { role: 'reviewer' },
    })

    await expect(
      authPOST({
        request: mockRequest,
        cookies: mockCookies,
      } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'Reviewers must sign in on the admin site.',
      }),
    )
  })

  it('authPOST backfills the role from the users doc when the custom claim is missing', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({ uid: 'uid123', customClaims: {} })
    mockAdminAuth.createSessionCookie.mockResolvedValue('sessionCookieVal')
    const usersDoc = mockDoc('uid123')
    usersDoc.get = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ role: 'instructor' }),
    })
    mockAdminDb.collection.mockImplementation((name: string) =>
      name === 'users'
        ? ({ doc: () => usersDoc } as any)
        : (mockCollection as any),
    )

    const res = await authPOST({
      request: mockRequest,
      cookies: mockCookies,
    } as any)

    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.setCustomUserClaims).toHaveBeenCalledWith('uid123', {
      role: 'instructor',
    })
    mockAdminDb.collection.mockReturnValue(mockCollection)
  })

  it('authPOST fails when no role can be determined at all', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({ uid: 'uid123', customClaims: {} })
    const usersDoc = mockDoc('uid123')
    usersDoc.get = jest.fn().mockResolvedValue({ exists: false })
    mockAdminDb.collection.mockImplementation((name: string) =>
      name === 'users'
        ? ({ doc: () => usersDoc } as any)
        : (mockCollection as any),
    )

    await expect(
      authPOST({ request: mockRequest, cookies: mockCookies } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'Users must sign in on the admin site.',
      }),
    )
    mockAdminDb.collection.mockReturnValue(mockCollection)
  })

  it('authPOST fails when the sign-in is not recent enough', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10 * 60,
    })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      customClaims: { role: 'student' },
    })

    await expect(
      authPOST({ request: mockRequest, cookies: mockCookies } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        message: 'Recent sign in required.',
      }),
    )
  })

  it('communityServicePOST successfully', async () => {
    mockRequest.json.mockResolvedValue({
      firstName: 'Student',
      hours: 10,
      season: 'fall',
      year: 2026,
      course: 'Math',
      presidents: 'Kendree Chen',
    })
    const res = await communityServicePOST({
      request: mockRequest as any,
      locals: { user: { email: 'student@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['student@test.com'],
      }),
    )
  })

  it('communityServicePOST returns a 500 json response when sending the email fails', async () => {
    await withRejectedSend(async () => {
      mockRequest.json.mockResolvedValue({
        firstName: 'Student',
        hours: 10,
        season: 'fall',
        year: 2026,
        course: 'Math',
        presidents: 'Kendree Chen',
      })
      const res = await communityServicePOST({
        request: mockRequest as any,
        locals: { user: { email: 'test@test.com' } },
      } as any)
      expect(res).toEqual(
        expect.objectContaining({
          body: { error: 'Failed to send email. Please try again later.' },
          init: { status: 500 },
        }),
      )
    })
  })

  it('communityServicePOST propagates the auth error when the user is not signed in', async () => {
    mockRequest.json.mockResolvedValue({ name: 'Student' })
    await expect(
      communityServicePOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 401, __isSvelteKitError: true }),
    )
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

  it('enrollPOST resolves instructor email via instructorUid', async () => {
    mockAdminAuth.getUser.mockResolvedValueOnce({
      uid: 'inst-uid-1',
      email: 'resolved-inst@test.com',
    })
    mockRequest.json.mockResolvedValue({
      email: 'student@test.com',
      firstName: 'Student',
      instructor: 'Instructor',
      instructorUid: 'inst-uid-1',
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
    expect(mockAdminAuth.getUser).toHaveBeenCalledWith('inst-uid-1')
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['test@test.com'],
        cc: ['resolved-inst@test.com'],
      }),
    )
  })

  it('enrollPOST returns 400 when instructor email cannot be resolved', async () => {
    mockRequest.json.mockResolvedValue({
      email: 'student@test.com',
      firstName: 'Student',
      instructor: 'Instructor',
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
    expect(res).toEqual(
      expect.objectContaining({
        body: { error: 'Instructor email could not be resolved.' },
        init: { status: 400 },
      }),
    )
  })

  it('enrollPOST returns a 500 json response when sending the email fails', async () => {
    await withRejectedSend(async () => {
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
      expect(res).toEqual(
        expect.objectContaining({
          body: { error: 'Failed to send email. Please try again later.' },
          init: { status: 500 },
        }),
      )
    })
  })

  it('enrollPOST propagates the auth error when the user is not signed in', async () => {
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
    await expect(
      enrollPOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 401, __isSvelteKitError: true }),
    )
  })

  it('interviewPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({
      email: 'interviewer@test.com',
      date: '2026-06-01',
      link: 'http://zoom',
      interviewer: 'Interviewer',
      firstName: 'Student',
    })
    const res = await interviewPOST({
      request: mockRequest as any,
      locals: { user: { email: 'student@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['student@test.com'],
        cc: ['interviewer@test.com'],
      }),
    )
  })

  it('interviewPOST resolves current email from interviewerUid when provided', async () => {
    mockAdminAuth.getUser.mockResolvedValueOnce({
      uid: 'interviewer-uid-1',
      email: 'updated-interviewer@test.com',
    })
    mockRequest.json.mockResolvedValue({
      email: 'stale-interviewer@test.com',
      interviewerUid: 'interviewer-uid-1',
      date: '2026-06-01',
      link: 'http://zoom',
      interviewer: 'Interviewer',
      firstName: 'Student',
    })
    const res = await interviewPOST({
      request: mockRequest as any,
      locals: { user: { email: 'student@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.getUser).toHaveBeenCalledWith('interviewer-uid-1')
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['student@test.com'],
        cc: ['updated-interviewer@test.com'],
      }),
    )
  })

  it('interviewPOST accepts a uid-only payload with no interviewer email', async () => {
    // The shape the current client sends after the uid migration.
    mockAdminAuth.getUser.mockResolvedValueOnce({
      uid: 'interviewer-uid-1',
      email: 'interviewer@test.com',
    })
    mockRequest.json.mockResolvedValue({
      interviewerUid: 'interviewer-uid-1',
      date: '2026-06-01',
      link: 'http://zoom',
      interviewer: 'Interviewer',
      firstName: 'Student',
    })
    const res = await interviewPOST({
      request: mockRequest as any,
      locals: { user: { email: 'student@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['student@test.com'],
        cc: ['interviewer@test.com'],
      }),
    )
  })

  it('interviewPOST rejects a payload with neither interviewerUid nor email', async () => {
    mockRequest.json.mockResolvedValue({
      date: '2026-06-01',
      link: 'http://zoom',
      interviewer: 'Interviewer',
      firstName: 'Student',
    })
    await expect(
      interviewPOST({
        request: mockRequest as any,
        locals: { user: { email: 'student@test.com' } },
      } as any),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('interviewPOST returns a 500 json response when sending the email fails', async () => {
    await withRejectedSend(async () => {
      mockRequest.json.mockResolvedValue({
        email: 'interviewer@test.com',
        date: '2026-06-01',
        link: 'http://zoom',
        interviewer: 'Interviewer',
        firstName: 'Student',
      })
      const res = await interviewPOST({
        request: mockRequest as any,
        locals: { user: { email: 'test@test.com' } },
      } as any)
      expect(res).toEqual(
        expect.objectContaining({
          body: { error: 'Failed to send email. Please try again later.' },
          init: { status: 500 },
        }),
      )
    })
  })

  it('interviewPOST propagates the auth error when the user is not signed in', async () => {
    mockRequest.json.mockResolvedValue({
      email: 'interviewer@test.com',
      date: '2026-06-01',
      link: 'http://zoom',
      interviewer: 'Interviewer',
      firstName: 'Student',
    })
    await expect(
      interviewPOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 401, __isSvelteKitError: true }),
    )
  })

  it('registrationPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({ name: 'Student' })
    const res = await registrationPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('registrationPOST returns a 500 json response when sending the email fails', async () => {
    await withRejectedSend(async () => {
      mockRequest.json.mockResolvedValue({ name: 'Student' })
      const res = await registrationPOST({
        request: mockRequest as any,
        locals: { user: { email: 'test@test.com' } },
      } as any)
      expect(res).toEqual(
        expect.objectContaining({
          body: { error: 'Failed to send email. Please try again later.' },
          init: { status: 500 },
        }),
      )
    })
  })

  it('registrationPOST propagates the auth error when the user is not signed in', async () => {
    mockRequest.json.mockResolvedValue({ name: 'Student' })
    await expect(
      registrationPOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 401, __isSvelteKitError: true }),
    )
  })

  it('remindStudentsPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({
      name: 'Student',
      email: 'student@test.com',
      instructorName: 'Instructor',
      instructorEmail: 'inst@test.com',
      instructorUids: [],
      class: 'Math',
      classTime: 'Monday at 2:00 PM',
    })
    const res = await remindStudentsPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com', role: 'instructor' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('remindStudentsPOST rejects a non-instructor with a 403', async () => {
    mockRequest.json.mockResolvedValue({
      name: 'Student',
      email: 'student@test.com',
      instructorName: 'Instructor',
      instructorEmail: 'inst@test.com',
      instructorUids: [],
      class: 'Math',
      classTime: 'Monday at 2:00 PM',
    })
    await expect(
      remindStudentsPOST({
        request: mockRequest as any,
        locals: { user: { email: 'test@test.com', role: 'student' } },
      } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'Only instructors can do that.',
      }),
    )
  })

  it('remindStudentsPOST returns a 500 json response when sending the email fails', async () => {
    await withRejectedSend(async () => {
      mockRequest.json.mockResolvedValue({
        name: 'Student',
        email: 'student@test.com',
        instructorName: 'Instructor',
        instructorEmail: 'inst@test.com',
        instructorUids: [],
        class: 'Math',
        classTime: 'Monday at 2:00 PM',
      })
      const res = await remindStudentsPOST({
        request: mockRequest as any,
        locals: { user: { email: 'test@test.com', role: 'instructor' } },
      } as any)
      expect(res).toEqual(
        expect.objectContaining({
          body: { error: 'Failed to send email. Please try again later.' },
          init: { status: 500 },
        }),
      )
    })
  })

  // The point of storing uids instead of addresses: the cc goes to whatever
  // address the account has right now, and the client never gets to name it.
  it('remindStudentsPOST resolves co-instructor uids to current emails server-side', async () => {
    mockAdminAuth.getUsers.mockResolvedValueOnce({
      users: [{ uid: 'co-uid-1', email: 'renamed@gbstem.org' }],
      notFound: [{ uid: 'co-uid-deleted' }],
    })
    mockRequest.json.mockResolvedValue({
      name: 'Student',
      email: 'student@test.com',
      instructorName: 'Instructor',
      instructorUids: ['co-uid-1', 'co-uid-deleted'],
      class: 'Math',
      classTime: 'Monday at 2:00 PM',
    })

    await remindStudentsPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com', role: 'instructor' } },
    } as any)

    // The deleted account is dropped rather than bouncing the whole send.
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ cc: ['renamed@gbstem.org'] }),
    )
  })

  // The list the client sends is the class's whole teaching staff, so the
  // sender is in it. Whoever pressed the button doesn't need a copy of their
  // own reminder - everyone else teaching the class does, which is what a
  // co-instructor sending one used to miss: they cc'd themselves and left the
  // class's primary instructor off entirely.
  it('remindStudentsPOST cc’s the class’s other instructors but not the sender', async () => {
    mockAdminAuth.getUsers.mockResolvedValueOnce({
      users: [{ uid: 'owner-uid', email: 'owner@gbstem.org' }],
      notFound: [],
    })
    mockRequest.json.mockResolvedValue({
      name: 'Student',
      email: 'student@test.com',
      instructorName: 'Instructor',
      instructorUids: ['owner-uid', 'caller-uid'],
      class: 'Math',
      classTime: 'Monday at 2:00 PM',
    })

    await remindStudentsPOST({
      request: mockRequest as any,
      locals: {
        user: {
          uid: 'caller-uid',
          email: 'caller@gbstem.org',
          role: 'instructor',
        },
      },
    } as any)

    // Only the other instructor was ever looked up - the caller is dropped
    // by uid, before resolution, so a changed email can't reintroduce them.
    expect(mockAdminAuth.getUsers).toHaveBeenCalledWith([{ uid: 'owner-uid' }])
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ cc: ['owner@gbstem.org'] }),
    )
  })

  it('remindStudentsPOST propagates the auth error when the user is not signed in', async () => {
    mockRequest.json.mockResolvedValue({
      name: 'Student',
      email: 'student@test.com',
      instructorName: 'Instructor',
      instructorEmail: 'inst@test.com',
      instructorUids: [],
      class: 'Math',
      classTime: 'Monday at 2:00 PM',
    })
    await expect(
      remindStudentsPOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 401, __isSvelteKitError: true }),
    )
  })

  it('slotRequestPOST successfully uses authenticated user email', async () => {
    mockRequest.json.mockResolvedValue({
      firstName: 'Student',
      timeSlot: '2026-06-01 10:00 AM',
      intervieweeEmail: 'outdated@test.com',
    })
    const res = await slotRequestPOST({
      request: mockRequest as any,
      locals: { user: { email: 'authenticated@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['admin@gbstem.org'],
        cc: ['contact@gbstem.org'],
      }),
    )
  })

  it('slotRequestPOST returns a 500 json response when sending the email fails', async () => {
    await withRejectedSend(async () => {
      mockRequest.json.mockResolvedValue({
        firstName: 'Student',
        timeSlot: '2026-06-01 10:00 AM',
      })
      const res = await slotRequestPOST({
        request: mockRequest as any,
        locals: { user: { email: 'test@test.com' } },
      } as any)
      expect(res).toEqual(
        expect.objectContaining({
          body: { error: 'Failed to send email. Please try again later.' },
          init: { status: 500 },
        }),
      )
    })
  })

  it('slotRequestPOST propagates the auth error when the user is not signed in', async () => {
    mockRequest.json.mockResolvedValue({
      firstName: 'Student',
      timeSlot: '2026-06-01 10:00 AM',
    })
    await expect(
      slotRequestPOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 401, __isSvelteKitError: true }),
    )
  })

  it('substitutePOST successfully resolves original instructor email via UID', async () => {
    mockAdminAuth.getUser.mockResolvedValueOnce({
      uid: 'orig-uid-1',
      email: 'orig@gbstem.org',
    })
    mockRequest.json.mockResolvedValue({
      firstName: 'Alice',
      course: 'Math',
      classNumber: 1,
      date: '2026-09-10',
      originalInstructorUid: 'orig-uid-1',
    })
    const res = await substitutePOST({
      request: mockRequest as any,
      locals: { user: { email: 'sub@gbstem.org', role: 'instructor' } },
    } as any)
    expect(mockAdminAuth.getUser).toHaveBeenCalledWith('orig-uid-1')
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('substitutePOST successfully falls back to originalInstructorEmail', async () => {
    mockRequest.json.mockResolvedValue({
      firstName: 'Alice',
      course: 'Math',
      classNumber: 1,
      date: '2026-09-10',
      originalInstructorEmail: 'orig@gbstem.org',
    })
    const res = await substitutePOST({
      request: mockRequest as any,
      locals: { user: { email: 'sub@gbstem.org', role: 'instructor' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('substitutePOST returns 400 when original instructor email cannot be resolved', async () => {
    mockRequest.json.mockResolvedValue({
      firstName: 'Alice',
      course: 'Math',
      classNumber: 1,
      date: '2026-09-10',
    })
    const res = await substitutePOST({
      request: mockRequest as any,
      locals: { user: { email: 'sub@gbstem.org', role: 'instructor' } },
    } as any)
    expect(res).toEqual(
      expect.objectContaining({
        body: { error: 'Original instructor email could not be resolved.' },
        init: { status: 400 },
      }),
    )
  })

  it('substitutePOST returns a 500 json response when sending the email fails', async () => {
    await withRejectedSend(async () => {
      mockRequest.json.mockResolvedValue({
        firstName: 'Alice',
        course: 'Math',
        classNumber: 1,
        date: '2026-09-10',
        originalInstructorEmail: 'orig@gbstem.org',
      })
      const res = await substitutePOST({
        request: mockRequest as any,
        locals: { user: { email: 'sub@gbstem.org', role: 'instructor' } },
      } as any)
      expect(res).toEqual(
        expect.objectContaining({
          body: { error: 'Failed to send email. Please try again later.' },
          init: { status: 500 },
        }),
      )
    })
  })

  it('substitutePOST throws 403 when user is not an instructor', async () => {
    mockRequest.json.mockResolvedValue({
      firstName: 'Alice',
      course: 'Math',
      classNumber: 1,
      date: '2026-09-10',
      originalInstructorEmail: 'orig@gbstem.org',
    })
    await expect(
      substitutePOST({
        request: mockRequest as any,
        locals: { user: { email: 'student@gbstem.org', role: 'student' } },
      } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 403, __isSvelteKitError: true }),
    )
  })

  it('substitutePOST propagates the auth error when the user is not signed in', async () => {
    mockRequest.json.mockResolvedValue({
      firstName: 'Alice',
      course: 'Math',
      classNumber: 1,
      date: '2026-09-10',
      originalInstructorEmail: 'orig@gbstem.org',
    })
    await expect(
      substitutePOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 401, __isSvelteKitError: true }),
    )
  })

  describe('tokenPOST', () => {
    const originalFetch = (global as any).fetch

    afterEach(() => {
      ;(global as any).fetch = originalFetch
    })

    it('tokenPOST returns the OAuth token response on success', async () => {
      ;(global as any).fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({ access_token: 'abc123' }),
      })

      const res = await tokenPOST({
        locals: { user: { email: 'test@test.com' } },
      } as any)

      expect(res).toEqual(
        expect.objectContaining({
          body: { access_token: 'abc123' },
          __isSvelteKitJson: true,
        }),
      )
    })

    it('tokenPOST returns a 500 json response when the token request fails', async () => {
      ;(global as any).fetch = jest
        .fn()
        .mockRejectedValue(new Error('network down'))

      const res = await tokenPOST({
        locals: { user: { email: 'test@test.com' } },
      } as any)

      expect(res).toEqual(
        expect.objectContaining({
          body: {
            error: 'Failed to fetch access token. Please try again later.',
          },
          init: { status: 500 },
        }),
      )
    })

    it('tokenPOST propagates the auth error when the user is not signed in', async () => {
      await expect(tokenPOST({ locals: {} } as any)).rejects.toEqual(
        expect.objectContaining({ status: 401, __isSvelteKitError: true }),
      )
    })
  })
})
