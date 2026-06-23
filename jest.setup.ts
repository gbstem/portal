import '@testing-library/jest-dom'
import { jest, beforeAll, afterAll } from '@jest/globals'

// Spy on console.log to suppress "Email sent" messages
const originalConsoleLog = console.log
let consoleLogSpy: any

beforeAll(() => {
  consoleLogSpy = jest
    .spyOn(console, 'log')
    .mockImplementation((message, ...args) => {
      if (typeof message === 'string' && message.includes('Email sent')) {
        return
      }
      originalConsoleLog(message, ...args)
    })
})

afterAll(() => {
  if (consoleLogSpy) {
    consoleLogSpy.mockRestore()
  }
})

// Global mock for SvelteKit Public Env
jest.mock(
  '$env/static/public',
  () => ({
    PUBLIC_FIREBASE_API_KEY: 'apiKey',
    PUBLIC_FIREBASE_AUTH_DOMAIN: 'authDomain',
    PUBLIC_FIREBASE_PROJECT_ID: 'projectId',
    PUBLIC_FIREBASE_STORAGE_BUCKET: 'storageBucket',
    PUBLIC_FIREBASE_MESSAGE_SENDER_ID: 'senderId',
    PUBLIC_FIREBASE_APP_ID: 'appId',
    PUBLIC_FIREBASE_MEASUREMENT_ID: 'measurementId',
  }),
  { virtual: true },
)

// Global mock for SvelteKit Private Env
jest.mock(
  '$env/static/private',
  () => ({
    FIREBASE_PROJECT_ID: 'projectIdPrivate',
    FIREBASE_CLIENT_EMAIL: 'clientEmail',
    FIREBASE_PRIVATE_KEY: 'privateKey',
    SENDGRID_API_TOKEN: 'sgToken',
  }),
  { virtual: true },
)

// Global mock for SvelteKit Dynamic Private Env
jest.mock(
  '$env/dynamic/private',
  () => ({
    env: {
      FIREBASE_AUTH_EMULATOR_HOST:
        process.env.FIREBASE_AUTH_EMULATOR_HOST || '',
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '',
      STORAGE_EMULATOR_HOST: process.env.STORAGE_EMULATOR_HOST || '',
    },
  }),
  { virtual: true },
)

// Global mock for SvelteKit Environment Module
jest.mock(
  '$app/environment',
  () => ({
    building: false,
    browser: false,
    dev: true,
    version: '1.0.0',
  }),
  { virtual: true },
)

// Global mock for @sendgrid/mail
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(() => Promise.resolve()),
}))

// Global mock for firebase/app
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}))

// Global mock for firebase/auth
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  onAuthStateChanged: jest.fn((authObj: any, callback: any) => {
    return jest.fn() // unsubscribe
  }),
}))

// Global mock for firebase/firestore
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
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    collection: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    arrayUnion: jest.fn((...val: any[]) => val),
    Timestamp: MockTimestamp,
  }
})

// Global mock for firebase/storage
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(),
}))

// Global mock for firebase-admin
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
}))

// Global mock for firebase-admin/auth
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
    createSessionCookie: jest.fn(),
    verifySessionCookie: jest.fn(),
    getUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
  })),
}))

// Global mock for firebase-admin/firestore
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(),
  })),
  FieldValue: {
    arrayUnion: jest.fn((...val: any[]) => val),
  },
}))
