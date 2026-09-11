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

// A transaction reads through each document's own get(), so whatever a test
// points adminDb.doc() at serves transactional reads too.
const mockTransaction = {
  get: jest.fn((ref: any) => ref.get()),
  set: jest.fn(),
  update: jest.fn(),
}
const mockAdminDb = {
  collection: jest.fn().mockReturnValue(mockCollection),
  doc: jest.fn().mockImplementation((id) => mockDoc(id)),
  runTransaction: jest.fn(async (fn: any) => fn(mockTransaction)),
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

// The transactional logic has its own suite (instructorClasses.test.ts); the
// route tests here cover authentication, validation and delegation.
const mockFetchInstructorClasses = jest.fn()
const mockSaveClassDetails = jest.fn()
jest.mock('$lib/server/instructorClasses', () => ({
  ...jest.requireActual('$lib/server/instructorClasses'),
  fetchInstructorClasses: (...args: any[]) =>
    mockFetchInstructorClasses(...args),
  saveClassDetails: (...args: any[]) => mockSaveClassDetails(...args),
}))

// Likewise the claim transaction (substituteRequests.test.ts); the route tests
// cover authentication, validation and the confirmation email.
const mockFetchOpenSubRequests = jest.fn()
const mockClaimSubRequest = jest.fn()
jest.mock('$lib/server/substituteRequests', () => ({
  ...jest.requireActual('$lib/server/substituteRequests'),
  fetchOpenSubRequests: (...args: any[]) => mockFetchOpenSubRequests(...args),
  claimSubRequest: (...args: any[]) => mockClaimSubRequest(...args),
}))

// And the enrollment transactions (classEnrollments.test.ts).
const mockEnrollStudent = jest.fn()
const mockUnenrollStudent = jest.fn()
jest.mock('$lib/server/classEnrollments', () => ({
  ...jest.requireActual('$lib/server/classEnrollments'),
  enrollStudent: (...args: any[]) => mockEnrollStudent(...args),
  unenrollStudent: (...args: any[]) => mockUnenrollStudent(...args),
}))

// And the feedback transactions (classFeedback.test.ts).
const mockFileInstructorFeedback = jest.fn()
const mockFileStudentFeedback = jest.fn()
jest.mock('$lib/server/classFeedback', () => ({
  ...jest.requireActual('$lib/server/classFeedback'),
  fileInstructorFeedback: (...args: any[]) =>
    mockFileInstructorFeedback(...args),
  fileStudentFeedback: (...args: any[]) => mockFileStudentFeedback(...args),
}))

// And the booking transaction (interviewSlots.test.ts).
const mockFetchInterviewData = jest.fn()
const mockBookInterviewSlot = jest.fn()
jest.mock('$lib/server/interviewSlots', () => ({
  ...jest.requireActual('$lib/server/interviewSlots'),
  fetchInterviewData: (...args: any[]) => mockFetchInterviewData(...args),
  bookInterviewSlot: (...args: any[]) => mockBookInterviewSlot(...args),
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
import { POST as signupPOST } from '../src/routes/api/signup/+server'
import { POST as communityServicePOST } from '../src/routes/api/communityService/+server'
import {
  DELETE as enrollDELETE,
  POST as enrollPOST,
} from '../src/routes/api/enroll/+server'
import {
  GET as interviewGET,
  POST as interviewPOST,
} from '../src/routes/api/interview/+server'
import { POST as registrationPOST } from '../src/routes/api/registration/+server'
import { POST as lookupCoInstructorPOST } from '../src/routes/api/lookupCoInstructor/+server'
import { NOT_AN_ACCEPTED_INSTRUCTOR } from '$lib/server/instructorDirectory'
import {
  classesCollection,
  decisionsCollection,
  registrationsCollection,
  substituteRequestsCollection,
} from '$lib/data/collections'
import { GET as classRosterGET } from '../src/routes/api/classRoster/+server'
import { POST as remindStudentsPOST } from '../src/routes/api/remindStudents/+server'
import { POST as resolveCoInstructorsPOST } from '../src/routes/api/resolveCoInstructors/+server'
import { POST as slotRequestPOST } from '../src/routes/api/slotRequest/+server'
import {
  GET as substituteGET,
  POST as substitutePOST,
} from '../src/routes/api/substitute/+server'
import { POST as substituteFeedbackPOST } from '../src/routes/api/substituteFeedback/+server'
import { POST as instructorFeedbackPOST } from '../src/routes/api/instructorFeedback/+server'
import { POST as studentFeedbackPOST } from '../src/routes/api/studentFeedback/+server'
import { POST as substituteSessionPOST } from '../src/routes/api/substituteSession/+server'
import { POST as meetingLinkPOST } from '../src/routes/api/meetingLink/+server'
import {
  GET as classDetailsGET,
  POST as classDetailsPOST,
} from '../src/routes/api/classDetails/+server'
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

/**
 * Points every adminDb.doc() read at `docs`. Anything unlisted reads as a missing document.
 */
function mockFirestoreDocs(docs: Record<string, any>) {
  mockAdminDb.doc.mockImplementation((path: string) => ({
    get: async () => ({ exists: path in docs, data: () => docs[path] }),
  }))
}

const instructorLocals = {
  user: { uid: 'caller-uid', email: 'caller@gbstem.org', role: 'instructor' },
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterAll(() => {
  ;(console.error as any).mockRestore?.()
  ;(console.warn as any).mockRestore?.()
})

describe('co-instructor directory routes', () => {
  let mockRequest: any

  const acceptedCaller = {
    [`${decisionsCollection}/caller-uid`]: { type: 'accepted' },
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

  it('actionPOST resetPassword ignores a signed-in caller-supplied email and uses their own', async () => {
    // A signed-in caller can only reset their own password - otherwise a
    // logged-in attacker could target any other account by supplying its
    // email here, the same hole changeEmail/verifyEmail don't have because
    // they read the email off the session rather than the request body.
    mockRequest.json.mockResolvedValue({
      type: 'resetPassword',
      email: 'victim@test.com',
    })
    const res = await actionPOST({
      request: mockRequest as any,
      locals: { user: { email: 'attacker@test.com' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.generatePasswordResetLink).toHaveBeenCalledWith(
      'attacker@test.com',
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
    expect(mockCookies.set).toHaveBeenCalledWith(
      '__session',
      'sessionCookieVal',
      // cookies.set()'s option is maxAge in *seconds*, not expiresIn in ms -
      // passing expiresIn silently did nothing, so the cookie was never
      // persisted for the intended 7 days.
      {
        maxAge: 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: true,
        path: '/',
      },
    )

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

  it('authPOST never reads a role out of the users document', async () => {
    // The escalation this closes: signup used to write a role into
    // users/{uid} from the browser and this route minted a custom claim from
    // it, so the claim the whole system authorizes against was a value the
    // client chose. Documents no longer carry a role, but one that somehow
    // said `instructor` must still count for nothing.
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({ uid: 'uid123', customClaims: {} })
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

    await expect(
      authPOST({ request: mockRequest, cookies: mockCookies } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'Users must sign in on the admin site.',
      }),
    )
    expect(mockAdminAuth.setCustomUserClaims).not.toHaveBeenCalled()
    expect(usersDoc.get).not.toHaveBeenCalled()
    mockAdminDb.collection.mockReturnValue(mockCollection)
  })

  it('authPOST fails when the account carries no role claim', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({ uid: 'uid123', customClaims: {} })

    await expect(
      authPOST({ request: mockRequest, cookies: mockCookies } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'Users must sign in on the admin site.',
      }),
    )
  })

  describe('signupPOST', () => {
    const body = {
      idToken: 'idToken123',
      firstName: 'Timmy',
      lastName: 'Turner',
      accountType: 'instructor' as const,
    }

    /** Points adminDb.doc('users/uid') at a document that may or may not exist. */
    function mockProfile(exists: boolean) {
      const set = jest.fn().mockResolvedValue(undefined)
      mockAdminDb.doc.mockImplementation(() => ({
        get: async () => ({ exists }),
        set,
      }))
      return set
    }

    beforeEach(() => {
      jest.clearAllMocks()
      mockRequest = { json: jest.fn() }
      mockAdminAuth.verifyIdToken.mockResolvedValue({ uid: 'uid123' })
      mockAdminAuth.getUser.mockResolvedValue({ uid: 'uid123' })
    })

    afterEach(() => {
      mockAdminDb.doc.mockImplementation((id: string) => mockDoc(id))
    })

    it('writes the name to the profile and the role to the claim', async () => {
      const set = mockProfile(false)
      mockRequest.json.mockResolvedValue(body)

      const res: any = await signupPOST({ request: mockRequest } as any)

      expect(res.body).toEqual({ role: 'instructor' })
      expect(set).toHaveBeenCalledWith({
        firstName: 'Timmy',
        lastName: 'Turner',
      })
      expect(mockAdminAuth.setCustomUserClaims).toHaveBeenCalledWith('uid123', {
        role: 'instructor',
      })
    })

    it('acts on the uid in the verified token, never one from the body', async () => {
      // The token is the whole authorization: a caller can only ever set up
      // the account they hold a token for.
      const set = mockProfile(false)
      mockRequest.json.mockResolvedValue({ ...body, uid: 'uid-victim' })

      await signupPOST({ request: mockRequest } as any)

      expect(mockAdminAuth.setCustomUserClaims).toHaveBeenCalledWith(
        'uid123',
        expect.anything(),
      )
      expect(set).toHaveBeenCalledTimes(1)
    })

    it('maps the student account type to the student role', async () => {
      mockProfile(false)
      mockRequest.json.mockResolvedValue({ ...body, accountType: 'student' })

      const res: any = await signupPOST({ request: mockRequest } as any)

      expect(res.body).toEqual({ role: 'student' })
    })

    it('refuses an account that already has a profile', async () => {
      // What stops this being a role-reassignment endpoint.
      mockProfile(true)
      mockRequest.json.mockResolvedValue(body)

      await expect(signupPOST({ request: mockRequest } as any)).rejects.toEqual(
        expect.objectContaining({ status: 409, __isSvelteKitError: true }),
      )
      expect(mockAdminAuth.setCustomUserClaims).not.toHaveBeenCalled()
    })

    it('refuses a role the client tries to name directly', async () => {
      mockProfile(false)
      mockRequest.json.mockResolvedValue({
        idToken: 'idToken123',
        firstName: 'Timmy',
        lastName: 'Turner',
        accountType: 'admin',
      })

      await expect(signupPOST({ request: mockRequest } as any)).rejects.toEqual(
        expect.objectContaining({ status: 400, __isSvelteKitError: true }),
      )
      expect(mockAdminAuth.setCustomUserClaims).not.toHaveBeenCalled()
    })

    it('refuses an unverifiable token', async () => {
      mockProfile(false)
      mockAdminAuth.verifyIdToken.mockRejectedValueOnce(
        new Error('Decoding Firebase ID token failed'),
      )
      mockRequest.json.mockResolvedValue(body)

      await expect(signupPOST({ request: mockRequest } as any)).rejects.toEqual(
        expect.objectContaining({ __isSvelteKitError: true }),
      )
      expect(mockAdminAuth.setCustomUserClaims).not.toHaveBeenCalled()
    })

    it('preserves claims the account already carries', async () => {
      mockProfile(false)
      mockAdminAuth.getUser.mockResolvedValue({
        uid: 'uid123',
        customClaims: { somethingElse: true },
      })
      mockRequest.json.mockResolvedValue(body)

      await signupPOST({ request: mockRequest } as any)

      expect(mockAdminAuth.setCustomUserClaims).toHaveBeenCalledWith('uid123', {
        somethingElse: true,
        role: 'instructor',
      })
    })
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

  describe('/api/enroll', () => {
    const CLASS_ID = 'teacher-uid-1'
    const STUDENT_UID = 'parent-uid-1'
    const parentLocals = {
      user: { uid: 'parent-uid', email: 'parent@test.com', role: 'student' },
    }

    /** The documents as enrollStudent returns them; `classOverrides` edits the class. */
    const enrollment = (classOverrides: Record<string, unknown> = {}) => ({
      classData: {
        course: 'Python 1',
        classDay1: 'Monday',
        classTime1: '16:00',
        classDay2: 'Wednesday',
        classTime2: '16:30',
        instructorFirstName: 'Grace',
        instructorUid: 'teacher-uid',
        instructorEmail: 'stored-teacher@test.com',
        meetingLink: 'https://zoom.us/j/1',
        online: true,
        classCap: 10,
        students: [STUDENT_UID],
        ...classOverrides,
      },
      registration: {
        personal: { studentFirstName: 'Ada', studentLastName: 'Lovelace' },
        classes: [CLASS_ID],
        enrolled: true,
      },
    })

    const call = (
      handler: typeof enrollPOST | typeof enrollDELETE,
      body: unknown = { classId: CLASS_ID, studentUid: STUDENT_UID },
      locals: any = parentLocals,
    ) => {
      mockRequest.json.mockResolvedValue(body)
      return handler({ request: mockRequest as any, locals } as any)
    }

    beforeEach(() => {
      jest.clearAllMocks()
      mockFirestoreDocs({ 'users/parent-uid': { firstName: 'Pat' } })
    })

    it("POST enrolls as the caller and emails them, copying the instructor's current address", async () => {
      mockEnrollStudent.mockResolvedValueOnce(enrollment())
      mockAdminAuth.getUser.mockResolvedValueOnce({
        uid: 'teacher-uid',
        email: 'current-teacher@test.com',
      })

      const res: any = await call(enrollPOST)

      expect(mockEnrollStudent).toHaveBeenCalledWith(
        { uid: 'parent-uid' },
        CLASS_ID,
        STUDENT_UID,
      )
      expect(mockAdminAuth.getUser).toHaveBeenCalledWith('teacher-uid')
      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['parent@test.com'],
          cc: ['current-teacher@test.com'],
          subject: 'Python 1 class details for Ada Lovelace',
        }),
      )
      const [message] = (MailService.send as jest.Mock).mock.calls[0]
      // The details come from the stored documents, not from the caller.
      expect(message.html).toContain('Pat')
      expect(message.html).toContain('Monday at 4:00 PM')
      expect(message.html).toContain('Wednesday at 4:30 PM')
      expect(message.html).toContain('https://zoom.us/j/1')
      expect(message.html).toContain('current-teacher@test.com')
      expect(res.body).toEqual({ emailSent: true })
    })

    it('POST ignores a recipient the caller tries to name', async () => {
      mockEnrollStudent.mockResolvedValueOnce(enrollment())
      mockAdminAuth.getUser.mockResolvedValueOnce({
        uid: 'teacher-uid',
        email: 'current-teacher@test.com',
      })

      await call(enrollPOST, {
        classId: CLASS_ID,
        studentUid: STUDENT_UID,
        instructorUid: 'victim-uid',
        instructorEmail: 'victim@test.com',
      })

      expect(mockAdminAuth.getUser).not.toHaveBeenCalledWith('victim-uid')
      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ cc: ['current-teacher@test.com'] }),
      )
    })

    it("POST falls back to the class's stored address when it has no instructorUid, and logs it", async () => {
      mockEnrollStudent.mockResolvedValueOnce(
        enrollment({ instructorUid: undefined }),
      )

      const res: any = await call(enrollPOST)

      expect(mockAdminAuth.getUser).not.toHaveBeenCalled()
      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ cc: ['stored-teacher@test.com'] }),
      )
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[legacy-email-fallback] /api/enroll'),
      )
      expect(res.body).toEqual({ emailSent: true })
    })

    it('POST falls back to the stored address when the instructorUid names no account, and logs it', async () => {
      mockEnrollStudent.mockResolvedValueOnce(enrollment())
      mockAdminAuth.getUser.mockRejectedValueOnce(new Error('user-not-found'))

      await call(enrollPOST)

      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ cc: ['stored-teacher@test.com'] }),
      )
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('resolved to no Auth account'),
        expect.anything(),
      )
    })

    it('POST uses the in-person template for an in-person class', async () => {
      mockEnrollStudent.mockResolvedValueOnce(enrollment({ online: false }))
      mockAdminAuth.getUser.mockResolvedValueOnce({
        uid: 'teacher-uid',
        email: 'current-teacher@test.com',
      })

      await call(enrollPOST)

      const [message] = (MailService.send as jest.Mock).mock.calls[0]
      expect(message.html).toContain('in-person')
    })

    it('POST reports the enrollment without an email when no instructor address resolves', async () => {
      mockEnrollStudent.mockResolvedValueOnce(
        enrollment({ instructorUid: undefined, instructorEmail: '' }),
      )

      const res: any = await call(enrollPOST)

      expect(MailService.send).not.toHaveBeenCalled()
      expect(res.body).toEqual({ emailSent: false })
    })

    it('POST reports the enrollment without an email when sending fails', async () => {
      await withRejectedSend(async () => {
        mockEnrollStudent.mockResolvedValueOnce(enrollment())
        mockAdminAuth.getUser.mockResolvedValueOnce({
          uid: 'teacher-uid',
          email: 'current-teacher@test.com',
        })

        const res: any = await call(enrollPOST)

        expect(res.body).toEqual({ emailSent: false })
      })
    })

    it('POST passes a refused enrollment through, and sends nothing', async () => {
      mockEnrollStudent.mockRejectedValueOnce({
        status: 409,
        message: 'That class is full.',
        __isSvelteKitError: true,
      })

      await expect(call(enrollPOST)).rejects.toEqual(
        expect.objectContaining({
          status: 409,
          message: 'That class is full.',
        }),
      )
      expect(MailService.send).not.toHaveBeenCalled()
    })

    it('POST rejects a payload without a student', async () => {
      await expect(call(enrollPOST, { classId: CLASS_ID })).rejects.toEqual(
        expect.objectContaining({ status: 400 }),
      )
      expect(mockEnrollStudent).not.toHaveBeenCalled()
    })

    it('POST rejects an instructor with a 403', async () => {
      await expect(
        call(enrollPOST, undefined, {
          user: { uid: 'i', email: 'i@x.org', role: 'instructor' },
        }),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
      expect(mockEnrollStudent).not.toHaveBeenCalled()
    })

    it('POST propagates the auth error when the user is not signed in', async () => {
      await expect(call(enrollPOST, undefined, {})).rejects.toEqual(
        expect.objectContaining({ status: 401, __isSvelteKitError: true }),
      )
      expect(mockEnrollStudent).not.toHaveBeenCalled()
    })

    it('DELETE unenrolls as the caller', async () => {
      mockUnenrollStudent.mockResolvedValueOnce(undefined)

      const res: any = await call(enrollDELETE)

      expect(mockUnenrollStudent).toHaveBeenCalledWith(
        { uid: 'parent-uid' },
        CLASS_ID,
        STUDENT_UID,
      )
      expect(res.body).toEqual({ message: 'Unenrolled from class.' })
      expect(MailService.send).not.toHaveBeenCalled()
    })

    it('DELETE rejects an instructor with a 403', async () => {
      await expect(
        call(enrollDELETE, undefined, {
          user: { uid: 'i', email: 'i@x.org', role: 'instructor' },
        }),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
      expect(mockUnenrollStudent).not.toHaveBeenCalled()
    })
  })

  describe('/api/interview', () => {
    const applicantLocals = {
      user: {
        uid: 'applicant-uid',
        email: 'applicant@test.com',
        role: 'instructor',
      },
    }

    /** The slot as bookInterviewSlot returns it; `overrides` edits it. */
    const booked = (overrides: Record<string, unknown> = {}) => ({
      id: 'slot-1',
      date: new Date('2026-10-01T18:00:00.000Z'),
      interviewerName: 'Interviewer',
      interviewerUid: 'interviewer-uid-1',
      interviewerEmail: 'stored-interviewer@test.com',
      meetingLink: 'http://zoom',
      intervieweeFirstName: 'Student',
      ...overrides,
    })

    const bookAs = (locals: any = applicantLocals) => {
      mockRequest.json.mockResolvedValue({ slotId: 'slot-1' })
      return interviewPOST({ request: mockRequest as any, locals } as any)
    }

    beforeEach(() => {
      jest.clearAllMocks()
    })

    it("GET returns the applicant's interview and the slots they could book", async () => {
      const data = {
        scheduledInterview: null,
        availableSlots: [
          {
            id: 'slot-1',
            date: '2026-10-01T18:00:00.000Z',
            interviewerName: 'Interviewer',
          },
        ],
      }
      mockFetchInterviewData.mockResolvedValueOnce(data)

      const res: any = await interviewGET({ locals: applicantLocals } as any)

      expect(mockFetchInterviewData).toHaveBeenCalledWith('applicant-uid')
      expect(res.body).toEqual(data)
    })

    it('GET rejects a student with a 403', async () => {
      await expect(
        interviewGET({
          locals: { user: { uid: 's', email: 's@x.org', role: 'student' } },
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
      expect(mockFetchInterviewData).not.toHaveBeenCalled()
    })

    it("POST books as the caller and emails them, copying the interviewer's current address", async () => {
      mockBookInterviewSlot.mockResolvedValueOnce(booked())
      mockAdminAuth.getUser.mockResolvedValueOnce({
        uid: 'interviewer-uid-1',
        email: 'updated-interviewer@test.com',
      })

      const res: any = await bookAs()

      expect(mockBookInterviewSlot).toHaveBeenCalledWith(
        { uid: 'applicant-uid', email: 'applicant@test.com' },
        'slot-1',
      )
      expect(mockAdminAuth.getUser).toHaveBeenCalledWith('interviewer-uid-1')
      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['applicant@test.com'],
          cc: ['updated-interviewer@test.com'],
          replyTo: 'updated-interviewer@test.com',
          subject:
            'Student, your interview with Interviewer has been scheduled',
        }),
      )
      // No interviewer address or uid goes back to the applicant.
      expect(res.body).toEqual({
        interview: {
          id: 'slot-1',
          date: '2026-10-01T18:00:00.000Z',
          interviewerName: 'Interviewer',
          meetingLink: 'http://zoom',
          interviewSlotStatus: 'pending',
        },
        emailSent: true,
      })
    })

    it('POST names the interview time in gbSTEM’s time zone, not the server’s', async () => {
      mockBookInterviewSlot.mockResolvedValueOnce(booked())
      mockAdminAuth.getUser.mockResolvedValueOnce({
        uid: 'interviewer-uid-1',
        email: 'interviewer@test.com',
      })

      await bookAs()

      const [message] = (MailService.send as jest.Mock).mock.calls[0]
      expect(message.html).toContain('2:00 PM Eastern Daylight Time')
    })

    it('POST falls back to the stored interviewer address for a slot with no uid', async () => {
      mockBookInterviewSlot.mockResolvedValueOnce(
        booked({ interviewerUid: undefined }),
      )

      await bookAs()

      expect(mockAdminAuth.getUser).not.toHaveBeenCalled()
      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ cc: ['stored-interviewer@test.com'] }),
      )
    })

    // The slot is booked by then, so the applicant is told so either way.
    it('POST still returns the booking when no interviewer address resolves', async () => {
      mockBookInterviewSlot.mockResolvedValueOnce(
        booked({ interviewerUid: undefined, interviewerEmail: undefined }),
      )

      const res: any = await bookAs()

      expect(MailService.send).not.toHaveBeenCalled()
      expect(res.body.emailSent).toBe(false)
      expect(res.body.interview.id).toBe('slot-1')
    })

    it('POST still returns the booking when the email fails to send', async () => {
      await withRejectedSend(async () => {
        mockBookInterviewSlot.mockResolvedValueOnce(
          booked({ interviewerUid: undefined }),
        )
        const res: any = await bookAs()
        expect(res.body.emailSent).toBe(false)
        expect(res.body.interview.id).toBe('slot-1')
      })
    })

    it('POST passes a refused booking straight through and sends nothing', async () => {
      mockBookInterviewSlot.mockRejectedValueOnce({
        status: 409,
        message:
          'The interview slot you selected is no longer available. Please select another slot.',
        __isSvelteKitError: true,
      })

      await expect(bookAs()).rejects.toEqual(
        expect.objectContaining({ status: 409 }),
      )
      expect(MailService.send).not.toHaveBeenCalled()
    })

    it('POST rejects a body with no slot id', async () => {
      mockRequest.json.mockResolvedValue({
        interviewerUid: 'interviewer-uid-1',
        date: '2026-06-01',
      })

      await expect(
        interviewPOST({
          request: mockRequest as any,
          locals: applicantLocals,
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 400 }))
      expect(mockBookInterviewSlot).not.toHaveBeenCalled()
    })

    it('POST rejects a student with a 403', async () => {
      await expect(
        bookAs({ user: { uid: 's', email: 's@x.org', role: 'student' } }),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
      expect(mockBookInterviewSlot).not.toHaveBeenCalled()
    })

    it('POST propagates the auth error when the user is not signed in', async () => {
      await expect(bookAs({})).rejects.toEqual(
        expect.objectContaining({ status: 401, __isSvelteKitError: true }),
      )
    })
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

  it('remindStudentsPOST rejects payload missing required class fields with 400', async () => {
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
        locals: instructorLocals,
      } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 400,
      }),
    )
  })

  it('remindStudentsPOST rejects a non-instructor with a 403', async () => {
    mockRequest.json.mockResolvedValue({
      classId: 'c-1',
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

  it('remindStudentsPOST logs and continues when sending an email fails', async () => {
    await withRejectedSend(async () => {
      mockFirestoreDocs({
        [`${classesCollection}/c-1`]: {
          instructorUid: 'caller-uid',
          students: ['s-1'],
        },
        [`${registrationsCollection}/s-1`]: {
          personal: {
            studentFirstName: 'Ada',
            email: 'ada@example.com',
          },
        },
      })
      mockRequest.json.mockResolvedValue({
        classId: 'c-1',
        classTime: 'Friday at 4:00 PM',
      })
      const res: any = await remindStudentsPOST({
        request: mockRequest as any,
        locals: instructorLocals,
      } as any)
      expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
      expect(res.body.count).toBe(0)
    })
  })

  // The point of resolving uids server-side: the cc goes to whatever
  // address the account has right now, and the client never gets to name it.
  it('remindStudentsPOST resolves co-instructor uids to current emails server-side', async () => {
    mockAdminAuth.getUsers.mockResolvedValueOnce({
      users: [{ uid: 'co-uid-1', email: 'renamed@gbstem.org' }],
      notFound: [{ uid: 'co-uid-deleted' }],
    })
    mockFirestoreDocs({
      [`${classesCollection}/c-1`]: {
        instructorUid: 'caller-uid',
        instructorFirstName: 'Lead',
        otherInstructorUids: ['co-uid-1', 'co-uid-deleted'],
        course: 'Python 1',
        students: ['s-1'],
      },
      [`${registrationsCollection}/s-1`]: {
        personal: {
          studentFirstName: 'Ada',
          email: 'ada@example.com',
        },
      },
    })
    mockRequest.json.mockResolvedValue({
      classId: 'c-1',
      classTime: 'Monday at 2:00 PM',
    })

    ;(MailService.send as jest.Mock).mockClear()
    await remindStudentsPOST({
      request: mockRequest as any,
      locals: instructorLocals,
    } as any)

    // The deleted account is dropped rather than bouncing the whole send.
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ cc: ['renamed@gbstem.org'] }),
    )
  })

  // The class's whole teaching staff is checked, but the caller is dropped
  // by uid so whoever pressed the button doesn't get a copy of their own
  // reminder - everyone else teaching the class does.
  it('remindStudentsPOST cc’s the class’s other instructors but not the sender', async () => {
    mockAdminAuth.getUsers.mockResolvedValueOnce({
      users: [{ uid: 'owner-uid', email: 'owner@gbstem.org' }],
      notFound: [],
    })
    mockFirestoreDocs({
      [`${classesCollection}/c-1`]: {
        instructorUid: 'owner-uid',
        instructorFirstName: 'Owner',
        otherInstructorUids: ['caller-uid'],
        course: 'Python 1',
        students: ['s-1'],
      },
      [`${registrationsCollection}/s-1`]: {
        personal: {
          studentFirstName: 'Ada',
          email: 'ada@example.com',
        },
      },
    })
    mockRequest.json.mockResolvedValue({
      classId: 'c-1',
      classTime: 'Monday at 2:00 PM',
    })

    ;(MailService.send as jest.Mock).mockClear()
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
      classId: 'c-1',
      classTime: 'Monday at 2:00 PM',
    })
    await expect(
      remindStudentsPOST({ request: mockRequest as any, locals: {} } as any),
    ).rejects.toEqual(
      expect.objectContaining({ status: 401, __isSvelteKitError: true }),
    )
  })

  it('remindStudentsPOST sends reminders to all enrolled students and CCs co-instructors', async () => {
    mockAdminAuth.getUsers.mockResolvedValueOnce({
      users: [{ uid: 'co-inst-1', email: 'coinst@gbstem.org' }],
      notFound: [],
    })
    mockFirestoreDocs({
      [`${classesCollection}/c-1`]: {
        instructorUid: 'caller-uid',
        instructorFirstName: 'Lead',
        otherInstructorUids: ['co-inst-1'],
        course: 'Python 1',
        students: ['s-1', 's-2'],
      },
      [`${registrationsCollection}/s-1`]: {
        personal: {
          studentFirstName: 'Ada',
          email: 'ada@example.com',
        },
      },
      [`${registrationsCollection}/s-2`]: {
        personal: {
          studentFirstName: 'Charles',
          email: 'charles@example.com',
        },
      },
    })

    mockRequest.json.mockResolvedValue({
      classId: 'c-1',
      classTime: 'Friday at 4:00 PM',
    })

    ;(MailService.send as jest.Mock).mockClear()
    const res: any = await remindStudentsPOST({
      request: mockRequest as any,
      locals: instructorLocals,
    } as any)

    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(res.body.count).toBe(2)
    expect(MailService.send).toHaveBeenCalledTimes(2)
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['ada@example.com'],
        cc: ['coinst@gbstem.org'],
        subject: 'gbSTEM Class Reminder',
      }),
    )
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['charles@example.com'],
        cc: ['coinst@gbstem.org'],
        subject: 'gbSTEM Class Reminder',
      }),
    )
  })

  it('remindStudentsPOST sends to a single enrolled student when studentUid is specified', async () => {
    mockAdminAuth.getUsers.mockResolvedValueOnce({
      users: [],
      notFound: [],
    })
    mockFirestoreDocs({
      [`${classesCollection}/c-1`]: {
        instructorUid: 'caller-uid',
        instructorFirstName: 'Lead',
        course: 'Python 1',
        students: ['s-1', 's-2'],
      },
      [`${registrationsCollection}/s-1`]: {
        personal: {
          studentFirstName: 'Ada',
          email: 'ada@example.com',
        },
      },
    })

    mockRequest.json.mockResolvedValue({
      classId: 'c-1',
      classTime: 'Friday at 4:00 PM',
      studentUid: 's-1',
    })

    ;(MailService.send as jest.Mock).mockClear()
    const res: any = await remindStudentsPOST({
      request: mockRequest as any,
      locals: instructorLocals,
    } as any)

    expect(res.body.count).toBe(1)
    expect(MailService.send).toHaveBeenCalledTimes(1)
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['ada@example.com'],
      }),
    )
  })

  it('remindStudentsPOST sends reminders when called by authorized substitute without co-instructor CCs', async () => {
    mockFirestoreDocs({
      [`${substituteRequestsCollection}/c-1---1`]: {
        subInstructorId: 'caller-uid',
        subInstructorFirstName: 'Substitute',
        classNumber: 1,
      },
      [`${classesCollection}/c-1`]: {
        instructorUid: 'owner-uid',
        otherInstructorUids: ['co-inst-1'],
        course: 'Python 1',
        students: ['s-1'],
        classStatuses: ['substitute needed'],
        meetingTimes: ['2026-10-01T10:00:00.000Z'],
      },
      [`${registrationsCollection}/s-1`]: {
        personal: {
          studentFirstName: 'Ada',
          email: 'ada@example.com',
        },
      },
    })

    mockRequest.json.mockResolvedValue({
      classId: 'c-1',
      classTime: 'Friday at 4:00 PM',
      subRequestId: 'c-1---1',
    })

    ;(MailService.send as jest.Mock).mockClear()
    const res: any = await remindStudentsPOST({
      request: mockRequest as any,
      locals: instructorLocals,
    } as any)

    expect(res.body.count).toBe(1)
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['ada@example.com'],
        subject: 'gbSTEM Class Reminder',
      }),
    )
    expect((MailService.send as jest.Mock).mock.calls[0][0].cc).toBeUndefined()
  })

  it('remindStudentsPOST rejects student not in class with 400', async () => {
    mockFirestoreDocs({
      [`${classesCollection}/c-1`]: {
        instructorUid: 'caller-uid',
        students: ['s-1'],
      },
    })

    mockRequest.json.mockResolvedValue({
      classId: 'c-1',
      classTime: 'Friday at 4:00 PM',
      studentUid: 'unregistered-student',
    })

    await expect(
      remindStudentsPOST({
        request: mockRequest as any,
        locals: instructorLocals,
      } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 400,
        message: 'Student is not enrolled in this class.',
      }),
    )
  })

  it('remindStudentsPOST returns 400 when class has no students', async () => {
    mockFirestoreDocs({
      [`${classesCollection}/c-1`]: {
        instructorUid: 'caller-uid',
        students: [],
      },
    })

    mockRequest.json.mockResolvedValue({
      classId: 'c-1',
      classTime: 'Friday at 4:00 PM',
    })

    const res: any = await remindStudentsPOST({
      request: mockRequest as any,
      locals: instructorLocals,
    } as any)

    expect(res.init.status).toBe(400)
    expect(res.body.message).toBe('That class has no students to remind.')
  })

  describe('GET /api/classRoster', () => {
    it('rejects unauthenticated caller with 401', async () => {
      const url = new URL('http://localhost/api/classRoster?classId=c-1')
      await expect(classRosterGET({ url, locals: {} } as any)).rejects.toEqual(
        expect.objectContaining({ status: 401, __isSvelteKitError: true }),
      )
    })

    it('rejects student role with 403', async () => {
      const url = new URL('http://localhost/api/classRoster?classId=c-1')
      await expect(
        classRosterGET({
          url,
          locals: { user: { uid: 's-1', role: 'student' } },
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 403, __isSvelteKitError: true }),
      )
    })

    it('returns 404 when class does not exist', async () => {
      mockFirestoreDocs({})
      const url = new URL(
        'http://localhost/api/classRoster?classId=nonexistent',
      )
      await expect(
        classRosterGET({
          url,
          locals: instructorLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 404, message: 'Class not found.' }),
      )
    })

    it('returns 403 when instructor is neither owner, co-instructor, nor admin', async () => {
      mockFirestoreDocs({
        [`${classesCollection}/c-1`]: {
          instructorUid: 'other-instructor',
          otherInstructorUids: [],
          students: ['student-1'],
        },
      })
      const url = new URL('http://localhost/api/classRoster?classId=c-1')
      await expect(
        classRosterGET({
          url,
          locals: instructorLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 403,
          message: 'You are not an instructor of that class.',
        }),
      )
    })

    it('returns sanitized student roster for class owner, stripping demographics/PII', async () => {
      mockFirestoreDocs({
        [`${classesCollection}/c-1`]: {
          instructorUid: 'caller-uid',
          otherInstructorUids: [],
          students: ['student-1', 'student-missing'],
        },
        [`${registrationsCollection}/student-1`]: {
          personal: {
            studentFirstName: 'Ada',
            studentLastName: 'Lovelace',
            email: 'ada@example.com',
            secondaryEmail: 'parent@example.com',
            phoneNumber: '555-1234',
            dateOfBirth: '2014-01-01',
            gender: 'Female',
            race: ['White'],
            frlp: 'Yes',
            parentEducation: 'College',
          },
          academic: {
            grade: 5,
            school: 'Test Academy',
          },
          inPerson: {
            allergies: 'Peanuts',
          },
        },
      })

      const url = new URL('http://localhost/api/classRoster?classId=c-1')
      const res: any = await classRosterGET({
        url,
        locals: instructorLocals,
      } as any)

      expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
      expect(res.body.students).toEqual([
        {
          uid: 'student-1',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          secondaryEmail: 'parent@example.com',
          phone: '555-1234',
          grade: 5,
          school: 'Test Academy',
        },
        {
          uid: 'student-missing',
          name: 'Unknown Student',
          email: '',
          secondaryEmail: '',
          phone: '',
          grade: '',
          school: '',
        },
      ])
      expect(res.body.students[0]).not.toHaveProperty('dateOfBirth')
      expect(res.body.students[0]).not.toHaveProperty('gender')
      expect(res.body.students[0]).not.toHaveProperty('race')
      expect(res.body.students[0]).not.toHaveProperty('frlp')
      expect(res.body.students[0]).not.toHaveProperty('allergies')
    })

    it('returns roster for co-instructor', async () => {
      mockFirestoreDocs({
        [`${classesCollection}/c-1`]: {
          instructorUid: 'owner-uid',
          otherInstructorUids: ['caller-uid'],
          students: ['student-1'],
        },
        [`${registrationsCollection}/student-1`]: {
          personal: {
            studentFirstName: 'Charles',
            studentLastName: 'Babbage',
            email: 'charles@example.com',
          },
          academic: { grade: 6, school: 'London School' },
        },
      })

      const url = new URL('http://localhost/api/classRoster?classId=c-1')
      const res: any = await classRosterGET({
        url,
        locals: instructorLocals,
      } as any)
      expect(res.body.students[0].name).toBe('Charles Babbage')
    })

    it('returns roster for substitute when subRequestId is valid', async () => {
      mockFirestoreDocs({
        [`${substituteRequestsCollection}/c-1---1`]: {
          subInstructorId: 'caller-uid',
          classNumber: 1,
        },
        [`${classesCollection}/c-1`]: {
          instructorUid: 'owner-uid',
          students: ['student-1'],
          classStatuses: ['substitute needed'],
          meetingTimes: ['2026-10-01T10:00:00.000Z'],
        },
        [`${registrationsCollection}/student-1`]: {
          personal: {
            studentFirstName: 'Grace',
            studentLastName: 'Hopper',
            email: 'grace@example.com',
          },
        },
      })

      const url = new URL(
        'http://localhost/api/classRoster?classId=c-1&subRequestId=c-1---1',
      )
      const res: any = await classRosterGET({
        url,
        locals: instructorLocals,
      } as any)
      expect(res.body.students[0].name).toBe('Grace Hopper')
    })
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

  describe('/api/substitute', () => {
    const SUB_REQUEST_ID = 'owner-uid-1---1'
    const subLocals = {
      user: { uid: 'sub-uid', email: 'sub@gbstem.org', role: 'instructor' },
    }

    /** The request as claimSubRequest returns it; `overrides` edits it. */
    const claimed = (overrides: Record<string, unknown> = {}) => ({
      id: SUB_REQUEST_ID,
      classNumber: 1,
      course: 'Math',
      dateOfClass: new Date('2026-09-10T20:00:00.000Z'),
      notes: 'Fractions.',
      link: 'https://zoom.us/j/1',
      originalInstructorEmail: 'stored-orig@gbstem.org',
      originalInstructorUid: 'orig-uid-1',
      requestedByUid: 'orig-uid-1',
      subInstructorId: 'sub-uid',
      subInstructorFirstName: 'Alice',
      subInstructorEmail: 'sub@gbstem.org',
      subRequestStatus: 'SubstituteFound',
      ...overrides,
    })

    const claimAs = (locals: any = subLocals) => {
      mockRequest.json.mockResolvedValue({ subRequestId: SUB_REQUEST_ID })
      return substitutePOST({ request: mockRequest as any, locals } as any)
    }

    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('GET returns the sessions the caller could cover', async () => {
      const open = [
        {
          id: 'a-1---1',
          course: 'Math',
          classNumber: 1,
          dateOfClass: '2026-09-10T20:00:00.000Z',
        },
      ]
      mockFetchOpenSubRequests.mockResolvedValueOnce(open)

      const res: any = await substituteGET({ locals: subLocals } as any)

      expect(mockFetchOpenSubRequests).toHaveBeenCalledWith('sub-uid')
      expect(res.body).toEqual({ subRequests: open })
    })

    it('GET rejects a student with a 403', async () => {
      await expect(
        substituteGET({
          locals: { user: { uid: 's', email: 's@x.org', role: 'student' } },
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
      expect(mockFetchOpenSubRequests).not.toHaveBeenCalled()
    })

    it('POST claims as the caller, emails from the stored request, and returns the claim', async () => {
      mockClaimSubRequest.mockResolvedValueOnce(claimed())
      mockAdminAuth.getUser
        .mockResolvedValueOnce({ uid: 'orig-uid-1', email: 'orig@gbstem.org' })
        .mockResolvedValueOnce({ uid: 'orig-uid-1', email: 'orig@gbstem.org' })

      const res: any = await claimAs()

      expect(mockClaimSubRequest).toHaveBeenCalledWith(
        { uid: 'sub-uid', email: 'sub@gbstem.org' },
        SUB_REQUEST_ID,
      )
      // The address on the account now, not the one stored on the request.
      expect(mockAdminAuth.getUser).toHaveBeenCalledWith('orig-uid-1')
      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['sub@gbstem.org'],
          cc: ['orig@gbstem.org'],
          replyTo: 'orig@gbstem.org',
        }),
      )
      expect(res.body.subRequest).toMatchObject({
        id: SUB_REQUEST_ID,
        notes: 'Fractions.',
        dateOfClass: '2026-09-10T20:00:00.000Z',
      })
    })

    it('POST names the session in gbSTEM’s time zone, not the server’s', async () => {
      mockClaimSubRequest.mockResolvedValueOnce(claimed())
      mockAdminAuth.getUser
        .mockResolvedValueOnce({ uid: 'orig-uid-1', email: 'orig@gbstem.org' })
        .mockResolvedValueOnce({ uid: 'orig-uid-1', email: 'orig@gbstem.org' })

      await claimAs()

      const [message] = (MailService.send as jest.Mock).mock.calls[0]
      expect(message.html).toContain('4:00 PM EDT')
    })

    // Whoever asked for the sub has to hear that one turned up, and for a
    // class with co-instructors that is not always the instructor the request
    // is filed against.
    it('POST cc’s the requester alongside the original instructor', async () => {
      mockClaimSubRequest.mockResolvedValueOnce(
        claimed({ requestedByUid: 'co-uid-1' }),
      )
      mockAdminAuth.getUser
        .mockResolvedValueOnce({ uid: 'orig-uid-1', email: 'orig@gbstem.org' })
        .mockResolvedValueOnce({ uid: 'co-uid-1', email: 'co@gbstem.org' })

      await claimAs()

      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['sub@gbstem.org'],
          cc: ['orig@gbstem.org', 'co@gbstem.org'],
          // Replies still go to the class's instructor of record.
          replyTo: 'orig@gbstem.org',
        }),
      )
    })

    it('POST does not cc the substitute, even as the one who asked', async () => {
      mockClaimSubRequest.mockResolvedValueOnce(
        claimed({ requestedByUid: 'sub-uid' }),
      )
      mockAdminAuth.getUser
        .mockResolvedValueOnce({ uid: 'orig-uid-1', email: 'orig@gbstem.org' })
        .mockResolvedValueOnce({ uid: 'sub-uid', email: 'sub@gbstem.org' })

      await claimAs()

      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ cc: ['orig@gbstem.org'] }),
      )
    })

    it('POST still sends when the requester’s account is gone', async () => {
      mockClaimSubRequest.mockResolvedValueOnce(
        claimed({ requestedByUid: 'deleted-uid' }),
      )
      mockAdminAuth.getUser
        .mockResolvedValueOnce({ uid: 'orig-uid-1', email: 'orig@gbstem.org' })
        .mockRejectedValueOnce(new Error('no such user'))

      const res = await claimAs()

      expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ cc: ['orig@gbstem.org'] }),
      )
    })

    it('POST falls back to the stored address for a request with no instructor uid', async () => {
      mockClaimSubRequest.mockResolvedValueOnce(
        claimed({
          originalInstructorUid: undefined,
          requestedByUid: undefined,
        }),
      )

      await claimAs()

      expect(mockAdminAuth.getUser).not.toHaveBeenCalled()
      expect(MailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          cc: ['stored-orig@gbstem.org'],
          replyTo: 'stored-orig@gbstem.org',
        }),
      )
    })

    it('POST returns 400 when no original instructor email can be resolved', async () => {
      mockClaimSubRequest.mockResolvedValueOnce(
        claimed({
          originalInstructorUid: undefined,
          originalInstructorEmail: '',
          requestedByUid: undefined,
        }),
      )

      const res = await claimAs()

      expect(res).toEqual(
        expect.objectContaining({
          body: { error: 'Original instructor email could not be resolved.' },
          init: { status: 400 },
        }),
      )
    })

    it('POST returns a 500 json response when sending the email fails', async () => {
      await withRejectedSend(async () => {
        mockClaimSubRequest.mockResolvedValueOnce(
          claimed({
            originalInstructorUid: undefined,
            requestedByUid: undefined,
          }),
        )
        const res = await claimAs()
        expect(res).toEqual(
          expect.objectContaining({
            body: { error: 'Failed to send email. Please try again later.' },
            init: { status: 500 },
          }),
        )
      })
    })

    it('POST passes a refused claim straight through and sends nothing', async () => {
      mockClaimSubRequest.mockRejectedValueOnce({
        status: 409,
        message: 'Somebody has already signed up to cover that class.',
        __isSvelteKitError: true,
      })

      await expect(claimAs()).rejects.toEqual(
        expect.objectContaining({ status: 409 }),
      )
      expect(MailService.send).not.toHaveBeenCalled()
    })

    it('POST rejects a body with no request id', async () => {
      mockRequest.json.mockResolvedValue({ firstName: 'Alice', course: 'Math' })

      await expect(
        substitutePOST({
          request: mockRequest as any,
          locals: subLocals,
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 400 }))
      expect(mockClaimSubRequest).not.toHaveBeenCalled()
    })

    it('POST throws 403 when user is not an instructor', async () => {
      await expect(
        claimAs({
          user: { uid: 's', email: 'student@gbstem.org', role: 'student' },
        }),
      ).rejects.toEqual(
        expect.objectContaining({ status: 403, __isSvelteKitError: true }),
      )
      expect(mockClaimSubRequest).not.toHaveBeenCalled()
    })

    it('POST propagates the auth error when the user is not signed in', async () => {
      await expect(claimAs({})).rejects.toEqual(
        expect.objectContaining({ status: 401, __isSvelteKitError: true }),
      )
    })
  })

  describe('meetingLinkPOST', () => {
    const originalFetch = (global as any).fetch
    const { env } = require('$env/dynamic/private')
    const originalEnv = { ...env }

    /** Replaces the Entra credentials in $env/dynamic/private for one test. */
    function setEnv(vars: Record<string, string | undefined>) {
      for (const key of [
        'MS_CLIENT_ID',
        'MS_CLIENT_SECRET',
        'MS_TENANT_ID',
        'MS_CALENDAR_USER',
        'VITE_CLIENT_ID',
        'VITE_CLIENT_SECRET',
        'VITE_TENTANT_ID',
      ]) {
        delete env[key]
      }
      Object.assign(env, vars)
    }

    const instructorLocals = {
      user: { uid: 'uid-owner', email: 'owner@gbstem.org', role: 'instructor' },
    }
    const body = {
      classId: 'uid-owner-1',
      course: 'Scratch',
      classDay1: 'Monday',
      classDay2: '',
    }

    /** Points adminDb.doc() at the class documents a test declares. */
    function mockClasses(docs: Record<string, any>) {
      mockAdminDb.doc.mockImplementation((path: string) => ({
        get: async () => ({ exists: path in docs, data: () => docs[path] }),
      }))
    }

    /** A Graph token call followed by a successful event creation. */
    function mockGraphSuccess(joinUrl = 'https://teams.example/join') {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ access_token: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ onlineMeeting: { joinUrl } }),
        })
      ;(global as any).fetch = fetchMock
      return fetchMock
    }

    beforeEach(() => {
      jest.clearAllMocks()
      mockRequest = { json: jest.fn() }
      mockClasses({})
    })

    afterEach(() => {
      ;(global as any).fetch = originalFetch
      mockAdminDb.doc.mockImplementation((id: string) => mockDoc(id))
      setEnv(originalEnv)
    })

    it('returns only the join URL, never the Graph token', async () => {
      const fetchMock = mockGraphSuccess()
      mockClasses({
        [`${classesCollection}/uid-owner-1`]: { instructorUid: 'uid-owner' },
      })
      mockRequest.json.mockResolvedValue(body)

      const res: any = await meetingLinkPOST({
        request: mockRequest,
        locals: instructorLocals,
      } as any)

      expect(res.body).toEqual({ joinUrl: 'https://teams.example/join' })
      expect(JSON.stringify(res.body)).not.toContain('abc123')
      // The token is used as a bearer header server-side and goes no further.
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
        'Bearer abc123',
      )
    })

    it('allows a co-instructor of the class', async () => {
      mockGraphSuccess()
      mockClasses({
        [`${classesCollection}/uid-owner-1`]: {
          instructorUid: 'uid-someone-else',
          otherInstructorUids: ['uid-owner'],
        },
      })
      mockRequest.json.mockResolvedValue(body)

      const res: any = await meetingLinkPOST({
        request: mockRequest,
        locals: instructorLocals,
      } as any)

      expect(res.body).toEqual({ joinUrl: 'https://teams.example/join' })
    })

    it('allows a class that does not exist yet under the caller uid', async () => {
      mockGraphSuccess()
      mockClasses({})
      mockRequest.json.mockResolvedValue(body)

      const res: any = await meetingLinkPOST({
        request: mockRequest,
        locals: instructorLocals,
      } as any)

      expect(res.body).toEqual({ joinUrl: 'https://teams.example/join' })
    })

    it('refuses a class the caller does not teach', async () => {
      mockGraphSuccess()
      mockClasses({
        [`${classesCollection}/uid-owner-1`]: {
          instructorUid: 'uid-someone-else',
          otherInstructorUids: [],
        },
      })
      mockRequest.json.mockResolvedValue(body)

      await expect(
        meetingLinkPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 403, __isSvelteKitError: true }),
      )
    })

    it("refuses a new class id that isn't the caller's own", async () => {
      mockGraphSuccess()
      mockClasses({})
      mockRequest.json.mockResolvedValue({ ...body, classId: 'uid-victim-1' })

      await expect(
        meetingLinkPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 403, __isSvelteKitError: true }),
      )
    })

    it('refuses a signed-in non-instructor', async () => {
      mockRequest.json.mockResolvedValue(body)

      await expect(
        meetingLinkPOST({
          request: mockRequest,
          locals: { user: { uid: 'uid-kid', role: 'student' } },
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 403, __isSvelteKitError: true }),
      )
    })

    it('refuses an unauthenticated caller', async () => {
      mockRequest.json.mockResolvedValue(body)

      await expect(
        meetingLinkPOST({ request: mockRequest, locals: {} } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 401, __isSvelteKitError: true }),
      )
    })

    it('surfaces a 502 when Graph refuses the token request', async () => {
      ;(global as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: 'invalid_client' }),
      })
      mockClasses({
        [`${classesCollection}/uid-owner-1`]: { instructorUid: 'uid-owner' },
      })
      mockRequest.json.mockResolvedValue(body)

      await expect(
        meetingLinkPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 502, __isSvelteKitError: true }),
      )
    })

    it('surfaces a 502 when Graph creates no online meeting', async () => {
      ;(global as any).fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ access_token: 'abc123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({}),
        })
      mockClasses({
        [`${classesCollection}/uid-owner-1`]: { instructorUid: 'uid-owner' },
      })
      mockRequest.json.mockResolvedValue(body)

      await expect(
        meetingLinkPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 502, __isSvelteKitError: true }),
      )
    })

    it('rejects a body with no class day', async () => {
      mockRequest.json.mockResolvedValue({ ...body, classDay1: '' })

      await expect(
        meetingLinkPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 400, __isSvelteKitError: true }),
      )
    })

    describe('Entra credentials', () => {
      const owned = { instructorUid: 'uid-owner' }

      it('prefers the MS_* variables', async () => {
        setEnv({
          MS_CLIENT_ID: 'ms-id',
          MS_CLIENT_SECRET: 'ms-secret',
          MS_TENANT_ID: 'ms-tenant',
          MS_CALENDAR_USER: 'classes@gbstem.test',
          VITE_CLIENT_ID: 'vite-id',
          VITE_CLIENT_SECRET: 'vite-secret',
          VITE_TENTANT_ID: 'vite-tenant',
        })
        const fetchMock = mockGraphSuccess()
        mockClasses({ [`${classesCollection}/uid-owner-1`]: owned })
        mockRequest.json.mockResolvedValue(body)

        await meetingLinkPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any)

        const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
        expect(tokenUrl).toContain('/ms-tenant/')
        expect(tokenInit.body).toContain('client_id=ms-id')
        expect(tokenInit.body).toContain('client_secret=ms-secret')
      })

      it('falls back to the VITE_* variables when the MS_* ones are unset', async () => {
        // The transitional state: production holds the old values as secrets
        // that cannot be read back and copied to the new names.
        setEnv({
          MS_CALENDAR_USER: 'classes@gbstem.test',
          VITE_CLIENT_ID: 'vite-id',
          VITE_CLIENT_SECRET: 'vite-secret',
          VITE_TENTANT_ID: 'vite-tenant',
        })
        const fetchMock = mockGraphSuccess()
        mockClasses({ [`${classesCollection}/uid-owner-1`]: owned })
        mockRequest.json.mockResolvedValue(body)

        const res: any = await meetingLinkPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any)

        expect(res.body).toEqual({ joinUrl: 'https://teams.example/join' })
        const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]
        expect(tokenUrl).toContain('/vite-tenant/')
        expect(tokenInit.body).toContain('client_id=vite-id')
        expect(tokenInit.body).toContain('client_secret=vite-secret')
      })

      it('logs [legacy-vite-env-fallback] whenever an old name is used', async () => {
        // The signal for when the fallback can be deleted: it is done when
        // this line stops appearing in the logs.
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
        setEnv({
          MS_CALENDAR_USER: 'classes@gbstem.test',
          VITE_CLIENT_ID: 'vite-id',
          VITE_CLIENT_SECRET: 'vite-secret',
          VITE_TENTANT_ID: 'vite-tenant',
        })
        mockGraphSuccess()
        mockClasses({ [`${classesCollection}/uid-owner-1`]: owned })
        mockRequest.json.mockResolvedValue(body)

        await meetingLinkPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any)

        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('[legacy-vite-env-fallback]'),
        )
        warn.mockRestore()
      })

      it('does not log the fallback warning when every MS_* name is set', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
        mockGraphSuccess()
        mockClasses({ [`${classesCollection}/uid-owner-1`]: owned })
        mockRequest.json.mockResolvedValue(body)

        await meetingLinkPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any)

        expect(warn).not.toHaveBeenCalledWith(
          expect.stringContaining('[legacy-vite-env-fallback]'),
        )
        warn.mockRestore()
      })

      it('uses the known tenant id when neither tenant variable is set', async () => {
        // A tenant id is not a secret, so a missing or misspelled variable
        // should not take the feature down.
        setEnv({
          MS_CLIENT_ID: 'ms-id',
          MS_CLIENT_SECRET: 'ms-secret',
          MS_CALENDAR_USER: 'classes@gbstem.test',
        })
        const fetchMock = mockGraphSuccess()
        mockClasses({ [`${classesCollection}/uid-owner-1`]: owned })
        mockRequest.json.mockResolvedValue(body)

        await meetingLinkPOST({
          request: mockRequest,
          locals: instructorLocals,
        } as any)

        expect(fetchMock.mock.calls[0][0]).toContain(
          '/c9f983d8-6c86-4534-8471-99c48eaab882/',
        )
      })

      it('returns a 503 naming what is missing when no credential is set', async () => {
        setEnv({ MS_CALENDAR_USER: 'classes@gbstem.test' })
        const fetchMock = mockGraphSuccess()
        mockClasses({ [`${classesCollection}/uid-owner-1`]: owned })
        mockRequest.json.mockResolvedValue(body)

        await expect(
          meetingLinkPOST({
            request: mockRequest,
            locals: instructorLocals,
          } as any),
        ).rejects.toEqual(
          expect.objectContaining({ status: 503, __isSvelteKitError: true }),
        )
        // Never reached Microsoft with an undefined secret.
        expect(fetchMock).not.toHaveBeenCalled()
      })

      it('returns a 503 when the calendar mailbox is unset', async () => {
        setEnv({
          MS_CLIENT_ID: 'ms-id',
          MS_CLIENT_SECRET: 'ms-secret',
          MS_TENANT_ID: 'ms-tenant',
        })
        mockGraphSuccess()
        mockClasses({ [`${classesCollection}/uid-owner-1`]: owned })
        mockRequest.json.mockResolvedValue(body)

        await expect(
          meetingLinkPOST({
            request: mockRequest,
            locals: instructorLocals,
          } as any),
        ).rejects.toEqual(
          expect.objectContaining({ status: 503, __isSvelteKitError: true }),
        )
      })
    })
  })
})

/**
 * The two endpoints that exist because a substitute cannot write to the class
 * they are covering: firestore.rules opens a class document to its own
 * instructors and its co-instructors, and a substitute is neither. Their
 * claim to write lives in the sub request naming them, which rules cannot
 * follow - so the Admin SDK checks it here, and these are the tests of that
 * check.
 */
describe('substitute session endpoints', () => {
  let mockRequest: any

  const SUB_REQUEST_ID = 'owner-uid-1---2'
  const substituteLocals = {
    user: { uid: 'sub-uid', email: 'sub@gbstem.org', role: 'instructor' },
  }

  /**
   * Points adminDb.doc() at a sub request and the class it belongs to.
   * `overrides` edits either document for the case under test.
   */
  function mockSubRequestAndClass(overrides: {
    subRequest?: Record<string, unknown>
    classData?: Record<string, unknown>
    missing?: 'subRequest' | 'class'
  }) {
    const subRequest = {
      classNumber: 2,
      course: 'Python 1',
      dateOfClass: 'timestamp-for-week-2',
      subInstructorId: 'sub-uid',
      subInstructorFirstName: 'Sub',
      subRequestStatus: 'SubstituteFound',
      ...overrides.subRequest,
    }
    const classData = {
      meetingLink: 'https://zoom.us/j/1',
      completedClassDates: ['timestamp-for-week-1'],
      classStatuses: ['EverythingComplete', 'ClassInFuture', 'ClassInFuture'],
      feedbackCompleted: [true, false, false],
      ...overrides.classData,
    }
    mockAdminDb.doc.mockImplementation((path: string) => {
      if (path === `${substituteRequestsCollection}/${SUB_REQUEST_ID}`) {
        return {
          get: async () => ({
            exists: overrides.missing !== 'subRequest',
            data: () => subRequest,
          }),
        }
      }
      if (path.startsWith(`${classesCollection}/`)) {
        return {
          get: async () => ({
            exists: overrides.missing !== 'class',
            data: () => classData,
          }),
        }
      }
      return { get: async () => ({ exists: false, data: () => undefined }) }
    })
    return { subRequest, classData }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequest = { json: jest.fn() }
  })

  afterEach(() => {
    mockAdminDb.doc.mockImplementation((id: string) => mockDoc(id))
  })

  describe('/api/substituteSession', () => {
    it('marks the session held and asks the substitute for feedback', async () => {
      mockSubRequestAndClass({})
      mockRequest.json.mockResolvedValue({ subRequestId: SUB_REQUEST_ID })

      const res: any = await substituteSessionPOST({
        request: mockRequest as any,
        locals: substituteLocals,
      } as any)

      expect(res.body).toEqual({
        meetingLink: 'https://zoom.us/j/1',
        alreadyRecorded: false,
      })
      // The class is written once, the request once, in one transaction that
      // also made both reads - the arrays are rewritten from what it read.
      expect(mockAdminDb.runTransaction).toHaveBeenCalledTimes(1)
      expect(mockTransaction.get).toHaveBeenCalledTimes(2)
      const [, classPayload] = mockTransaction.update.mock.calls[0]
      expect(classPayload.completedClassDates).toEqual([
        'timestamp-for-week-1',
        'timestamp-for-week-2',
      ])
      // Indexed by classNumber - 1: week 2, leaving weeks 1 and 3 alone.
      expect(classPayload.classStatuses).toEqual([
        'EverythingComplete',
        'FeedbackIncomplete',
        'ClassInFuture',
      ])
      const [, subRequestPayload] = mockTransaction.update.mock.calls[1]
      expect(subRequestPayload).toEqual({
        subRequestStatus: 'SubstituteFeedbackNeeded',
      })
    })

    it('is idempotent - joining twice records the date once', async () => {
      mockSubRequestAndClass({
        subRequest: { subRequestStatus: 'SubstituteFeedbackNeeded' },
      })
      mockRequest.json.mockResolvedValue({ subRequestId: SUB_REQUEST_ID })

      const res: any = await substituteSessionPOST({
        request: mockRequest as any,
        locals: substituteLocals,
      } as any)

      // The link still comes back, so a dropped call can be rejoined.
      expect(res.body).toEqual({
        meetingLink: 'https://zoom.us/j/1',
        alreadyRecorded: true,
      })
      expect(mockTransaction.update).not.toHaveBeenCalled()
    })

    it('refuses an instructor who is not the substitute for that class', async () => {
      mockSubRequestAndClass({
        subRequest: { subInstructorId: 'someone-else' },
      })
      mockRequest.json.mockResolvedValue({ subRequestId: SUB_REQUEST_ID })

      await expect(
        substituteSessionPOST({
          request: mockRequest as any,
          locals: substituteLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 403,
          message: 'You are not the substitute for that class.',
        }),
      )
      expect(mockTransaction.update).not.toHaveBeenCalled()
    })

    it('refuses a request nobody has signed up for', async () => {
      mockSubRequestAndClass({ subRequest: { subInstructorId: '' } })
      mockRequest.json.mockResolvedValue({ subRequestId: SUB_REQUEST_ID })

      await expect(
        substituteSessionPOST({
          request: mockRequest as any,
          locals: substituteLocals,
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
    })

    it('404s a request or class that has since been deleted', async () => {
      mockSubRequestAndClass({ missing: 'subRequest' })
      mockRequest.json.mockResolvedValue({ subRequestId: SUB_REQUEST_ID })
      await expect(
        substituteSessionPOST({
          request: mockRequest as any,
          locals: substituteLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 404,
          message: 'That substitute request no longer exists.',
        }),
      )

      mockSubRequestAndClass({ missing: 'class' })
      await expect(
        substituteSessionPOST({
          request: mockRequest as any,
          locals: substituteLocals,
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 404 }))
    })

    it('refuses a session that is off the end of the schedule', async () => {
      // The per-session arrays are indexed by `classNumber - 1`, and writing
      // past the end extends the array with holes rather than failing - so a
      // request left pointing at a session the instructor has since deleted
      // has to be caught before anything is written.
      mockSubRequestAndClass({ subRequest: { classNumber: 9 } })
      mockRequest.json.mockResolvedValue({ subRequestId: SUB_REQUEST_ID })

      await expect(
        substituteSessionPOST({
          request: mockRequest as any,
          locals: substituteLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining('no longer on the schedule'),
        }),
      )
      expect(mockTransaction.update).not.toHaveBeenCalled()
    })

    it('rejects a caller who is not an instructor at all', async () => {
      mockSubRequestAndClass({})
      mockRequest.json.mockResolvedValue({ subRequestId: SUB_REQUEST_ID })

      await expect(
        substituteSessionPOST({
          request: mockRequest as any,
          locals: { user: { uid: 's', email: 's@x.org', role: 'student' } },
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
    })
  })

  describe('/api/substituteFeedback', () => {
    const feedbackBody = {
      subRequestId: SUB_REQUEST_ID,
      date: '2026-10-02',
      feedback: 'Covered lists and loops.',
      attendanceList: { 'Ada Lovelace': { present: true } },
      classNumber: 2,
    }

    it('files the feedback, completes the session and closes the request', async () => {
      mockSubRequestAndClass({})
      mockRequest.json.mockResolvedValue(feedbackBody)

      const res: any = await substituteFeedbackPOST({
        request: mockRequest as any,
        locals: substituteLocals,
      } as any)

      expect(res.body.feedbackId).toMatch(/^owner-uid-1-\d+$/)
      expect(mockAdminDb.runTransaction).toHaveBeenCalledTimes(1)
      expect(mockTransaction.get).toHaveBeenCalledTimes(2)
      const [, feedbackDoc] = mockTransaction.set.mock.calls[0]
      expect(feedbackDoc).toEqual(
        expect.objectContaining({
          date: '2026-10-02',
          feedback: 'Covered lists and loops.',
          attendanceList: { 'Ada Lovelace': { present: true } },
          classNumber: 2,
          // Both read off the request rather than taken from the browser.
          courseName: 'Python 1',
          instructorName: 'Sub',
        }),
      )
      const [, classPayload] = mockTransaction.update.mock.calls[0]
      expect(classPayload.feedbackCompleted).toEqual([true, true, false])
      expect(classPayload.classStatuses).toEqual([
        'EverythingComplete',
        'EverythingComplete',
        'ClassInFuture',
      ])
      // Closing the request out is what credits the substitute's hours, so it
      // has to be in the same transaction as the feedback.
      const [, subRequestPayload] = mockTransaction.update.mock.calls[1]
      expect(subRequestPayload).toEqual({
        subRequestStatus: 'NoSubstituteNeeded',
      })
    })

    it('refuses feedback filed against a different session', async () => {
      mockSubRequestAndClass({})
      mockRequest.json.mockResolvedValue({ ...feedbackBody, classNumber: 3 })

      await expect(
        substituteFeedbackPOST({
          request: mockRequest as any,
          locals: substituteLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining('That request is for class #2'),
        }),
      )
      expect(mockTransaction.update).not.toHaveBeenCalled()
    })

    it('refuses an instructor who is not the substitute for that class', async () => {
      mockSubRequestAndClass({
        subRequest: { subInstructorId: 'someone-else' },
      })
      mockRequest.json.mockResolvedValue(feedbackBody)

      await expect(
        substituteFeedbackPOST({
          request: mockRequest as any,
          locals: substituteLocals,
        } as any),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
      expect(mockTransaction.update).not.toHaveBeenCalled()
    })

    it('rejects an empty reflection rather than storing one', async () => {
      mockSubRequestAndClass({})
      mockRequest.json.mockResolvedValue({ ...feedbackBody, feedback: '' })

      await expect(
        substituteFeedbackPOST({
          request: mockRequest as any,
          locals: substituteLocals,
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining('Reflection/feedback is required'),
        }),
      )
    })
  })
})

describe('class feedback endpoints', () => {
  const call = (handler: any, body: unknown, locals: any) =>
    handler({
      request: { json: jest.fn().mockResolvedValue(body) },
      locals,
    } as any)

  beforeEach(() => {
    jest.clearAllMocks()
    mockFileInstructorFeedback.mockResolvedValue('owner-uid-1-123')
    mockFileStudentFeedback.mockResolvedValue('owner-uid-1-123')
  })

  describe('/api/instructorFeedback', () => {
    const body = {
      classId: 'owner-uid-1',
      date: '2026-10-02',
      feedback: 'Covered lists and loops.',
      attendanceList: { 'Ada Lovelace': { present: true } },
      classNumber: 2,
    }

    it("files the caller's feedback and returns the document id", async () => {
      const res: any = await call(
        instructorFeedbackPOST,
        body,
        instructorLocals,
      )

      expect(mockFileInstructorFeedback).toHaveBeenCalledWith(
        { uid: 'caller-uid' },
        body,
      )
      expect(res.body).toEqual({ feedbackId: 'owner-uid-1-123' })
    })

    it('drops the fields the server fills in itself', async () => {
      await call(
        instructorFeedbackPOST,
        {
          ...body,
          courseName: 'Forged',
          instructorName: 'Someone Else',
          semester: 'Spring20',
        },
        instructorLocals,
      )

      expect(mockFileInstructorFeedback).toHaveBeenCalledWith(
        { uid: 'caller-uid' },
        body,
      )
    })

    it('coerces a typed session number', async () => {
      await call(
        instructorFeedbackPOST,
        { ...body, classNumber: '2' },
        instructorLocals,
      )

      expect(mockFileInstructorFeedback.mock.calls[0][1].classNumber).toBe(2)
    })

    it('refuses a signed-out caller', async () => {
      await expect(
        call(instructorFeedbackPOST, body, { user: null }),
      ).rejects.toEqual(expect.objectContaining({ status: 401 }))
      expect(mockFileInstructorFeedback).not.toHaveBeenCalled()
    })

    it('refuses a student account', async () => {
      await expect(
        call(instructorFeedbackPOST, body, {
          user: { uid: 'parent-uid', role: 'student' },
        }),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
      expect(mockFileInstructorFeedback).not.toHaveBeenCalled()
    })

    it.each([
      [
        'an empty reflection',
        { feedback: '' },
        'Reflection/feedback is required',
      ],
      ['no class', { classId: '' }, 'A class is required'],
      ['no date', { date: '' }, 'Date of class is required'],
      ['session zero', { classNumber: 0 }, 'classNumber'],
      [
        'attendance that is not a checkbox',
        { attendanceList: { Ada: { present: 'yes' } } },
        'attendanceList',
      ],
    ])('rejects %s', async (_label, overrides, message) => {
      await expect(
        call(
          instructorFeedbackPOST,
          { ...body, ...overrides },
          instructorLocals,
        ),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining(message),
        }),
      )
      expect(mockFileInstructorFeedback).not.toHaveBeenCalled()
    })

    it("passes on the DAL's refusal", async () => {
      mockFileInstructorFeedback.mockRejectedValueOnce({
        status: 403,
        message: 'You are not an instructor of that class.',
        __isSvelteKitError: true,
      })

      await expect(
        call(instructorFeedbackPOST, body, instructorLocals),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
    })
  })

  describe('/api/studentFeedback', () => {
    const parentLocals = {
      user: { uid: 'parent-uid', email: 'parent@test.com', role: 'student' },
    }
    const body = {
      studentId: 'parent-uid-1',
      classId: 'owner-uid-1',
      date: '2026-10-02',
      rating: 4,
      feedback: 'Loved it!',
    }

    it("files the caller's feedback and returns the document id", async () => {
      const res: any = await call(studentFeedbackPOST, body, parentLocals)

      expect(mockFileStudentFeedback).toHaveBeenCalledWith(
        { uid: 'parent-uid' },
        body,
      )
      expect(res.body).toEqual({ feedbackId: 'owner-uid-1-123' })
    })

    it('drops the fields the server fills in itself', async () => {
      await call(
        studentFeedbackPOST,
        {
          ...body,
          studentName: 'Forged',
          course: 'Forged',
          instructor: 'Forged',
          semester: 'Spring20',
        },
        parentLocals,
      )

      expect(mockFileStudentFeedback).toHaveBeenCalledWith(
        { uid: 'parent-uid' },
        body,
      )
    })

    it('refuses a signed-out caller', async () => {
      await expect(
        call(studentFeedbackPOST, body, { user: null }),
      ).rejects.toEqual(expect.objectContaining({ status: 401 }))
      expect(mockFileStudentFeedback).not.toHaveBeenCalled()
    })

    it('refuses an instructor account', async () => {
      await expect(
        call(studentFeedbackPOST, body, instructorLocals),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
      expect(mockFileStudentFeedback).not.toHaveBeenCalled()
    })

    it.each([
      ['a rating above 5', { rating: 6 }, 'Rating must be at most 5'],
      ['a rating below 1', { rating: 0 }, 'Rating must be at least 1'],
      ['a fractional rating', { rating: 2.5 }, 'rating'],
      ['empty feedback', { feedback: '' }, 'Feedback is required'],
      ['no student', { studentId: '' }, 'Please select a child'],
      ['no class', { classId: '' }, 'Please select a course'],
    ])('rejects %s', async (_label, overrides, message) => {
      await expect(
        call(studentFeedbackPOST, { ...body, ...overrides }, parentLocals),
      ).rejects.toEqual(
        expect.objectContaining({
          status: 400,
          message: expect.stringContaining(message),
        }),
      )
      expect(mockFileStudentFeedback).not.toHaveBeenCalled()
    })

    it("passes on the DAL's refusal", async () => {
      mockFileStudentFeedback.mockRejectedValueOnce({
        status: 403,
        message: 'That student is not enrolled in that class.',
        __isSvelteKitError: true,
      })

      await expect(
        call(studentFeedbackPOST, body, parentLocals),
      ).rejects.toEqual(expect.objectContaining({ status: 403 }))
    })
  })
})

describe('/api/classDetails', () => {
  const classDetailsBody = {
    classId: 'caller-uid-1',
    details: {
      course: 'Python 1',
      gradeRecommendation: '6-8',
      classCap: 7,
      meetingLink: '',
      classDay1: 'Monday',
      classTime1: '16:00',
      classDay2: '',
      classTime2: '',
      online: true,
      otherInstructorUids: ['co-uid'],
    },
    schedule: {
      meetingTimes: ['2026-10-05T20:00:00.000Z'],
      feedbackCompleted: [false],
      classStatuses: ['ClassInFuture'],
    },
  }

  const postWith = (body: unknown, locals: any = instructorLocals) =>
    classDetailsPOST({
      request: { json: async () => body },
      locals,
    } as any)

  beforeEach(() => {
    jest.clearAllMocks()
    mockSaveClassDetails.mockResolvedValue(undefined)
  })

  it("GET returns the signed-in instructor's classes", async () => {
    mockFetchInstructorClasses.mockResolvedValue({
      'caller-uid-1': { course: 'Python 1' },
    })

    const res: any = await classDetailsGET({ locals: instructorLocals } as any)

    expect(mockFetchInstructorClasses).toHaveBeenCalledWith('caller-uid')
    expect(res.body).toEqual({
      classes: { 'caller-uid-1': { course: 'Python 1' } },
    })
  })

  it('GET rejects a student with a 403 and a signed-out caller with a 401', async () => {
    await expect(
      classDetailsGET({
        locals: { user: { uid: 's-1', role: 'student' } },
      } as any),
    ).rejects.toEqual(expect.objectContaining({ status: 403 }))
    await expect(classDetailsGET({ locals: {} } as any)).rejects.toEqual(
      expect.objectContaining({ status: 401 }),
    )
    expect(mockFetchInstructorClasses).not.toHaveBeenCalled()
  })

  it('POST saves as the signed-in instructor, with schedule dates as Dates', async () => {
    const res: any = await postWith(classDetailsBody)

    expect(res.body).toEqual({ classId: 'caller-uid-1' })
    const [caller, classId, details, schedule] =
      mockSaveClassDetails.mock.calls[0]
    expect(caller).toEqual({ uid: 'caller-uid', email: 'caller@gbstem.org' })
    expect(classId).toBe('caller-uid-1')
    expect(details).toEqual(classDetailsBody.details)
    expect(schedule.meetingTimes).toEqual([
      new Date('2026-10-05T20:00:00.000Z'),
    ])
  })

  it('POST drops ownership and roster fields rather than passing them on', async () => {
    await postWith({
      ...classDetailsBody,
      details: {
        ...classDetailsBody.details,
        instructorUid: 'someone-else',
        students: ['student-1'],
      },
    })

    const [, , details] = mockSaveClassDetails.mock.calls[0]
    expect(details).not.toHaveProperty('instructorUid')
    expect(details).not.toHaveProperty('students')
  })

  it('POST refuses a schedule whose arrays disagree in length', async () => {
    await expect(
      postWith({
        ...classDetailsBody,
        schedule: { ...classDetailsBody.schedule, classStatuses: [] },
      }),
    ).rejects.toEqual(expect.objectContaining({ status: 400 }))
    expect(mockSaveClassDetails).not.toHaveBeenCalled()
  })

  it('POST rejects a student with a 403', async () => {
    await expect(
      postWith(classDetailsBody, { user: { uid: 's-1', role: 'student' } }),
    ).rejects.toEqual(expect.objectContaining({ status: 403 }))
    expect(mockSaveClassDetails).not.toHaveBeenCalled()
  })

  it("POST passes the save's refusal straight through", async () => {
    mockSaveClassDetails.mockRejectedValue({
      status: 403,
      message: 'You are not an instructor of that class.',
      __isSvelteKitError: true,
    })

    await expect(postWith(classDetailsBody)).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'You are not an instructor of that class.',
      }),
    )
  })
})
