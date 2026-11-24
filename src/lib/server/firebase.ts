import { building } from '$app/env'
import {
  FIREBASE_AUTH_EMULATOR_HOST,
  FIRESTORE_EMULATOR_HOST,
  STORAGE_EMULATOR_HOST,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_PROJECT_ID,
} from '$app/env/private'
import { cleanEnvVar } from '#lib/utils.js'

// TODO: package.json pins jwks-rsa to ^3 (jose 4, which has a CJS build) via
// "resolutions". firebase-admin 14 asks for jwks-rsa 4, which requires the
// ESM-only jose 6, and Vercel's Node launcher (/opt/rust/nodejs.js) rejects
// that require() with ERR_REQUIRE_ESM even on Node 26 (found on admin's
// preview deployment, 2026-11-24). Try removing the resolution after a Vercel
// runtime update, and verify on a preview deployment, since local Node loads
// it fine. Keep in step with ../admin.

// Copy and clean emulator environment variables to process.env so firebase-admin can detect them
const authHost = cleanEnvVar(
  FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST,
)
const firestoreHost = cleanEnvVar(
  FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST,
)
const storageHost = cleanEnvVar(
  STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST,
)

if (authHost) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost
}
if (firestoreHost) {
  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost
}
if (storageHost) {
  process.env.STORAGE_EMULATOR_HOST = storageHost
}

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import {
  CollectionReference,
  DocumentReference,
  getFirestore,
  Query,
  type Firestore,
} from 'firebase-admin/firestore'

// Wrap prototype methods with a timeout and error logger
function wrapPrototypePromise(
  Class: any,
  methodName: string,
  className: string,
) {
  if (!Class || !Class.prototype) return
  const original = Class.prototype[methodName]
  if (typeof original !== 'function') return

  Class.prototype[methodName] = function (...args: any[]) {
    const promise = original.apply(this, args)
    if (!(promise instanceof Promise)) {
      return promise
    }

    const timeoutMs = 10000
    let timer: NodeJS.Timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Firestore operation timed out on ${className}.${methodName}`,
          ),
        )
      }, timeoutMs)
    })

    return Promise.race([promise, timeoutPromise])
      .then((val) => {
        clearTimeout(timer)
        return val
      })
      .catch((err) => {
        clearTimeout(timer)
        console.error(`[Firestore Error] ${className}.${methodName}:`, err)
        throw err
      })
  }
}

// Apply wraps
wrapPrototypePromise(DocumentReference, 'get', 'DocumentReference')
wrapPrototypePromise(DocumentReference, 'set', 'DocumentReference')
wrapPrototypePromise(DocumentReference, 'update', 'DocumentReference')
wrapPrototypePromise(DocumentReference, 'delete', 'DocumentReference')
wrapPrototypePromise(DocumentReference, 'create', 'DocumentReference')
wrapPrototypePromise(Query, 'get', 'Query')
wrapPrototypePromise(CollectionReference, 'add', 'CollectionReference')

export let adminAuth: Auth
export let adminDb: Firestore

if (!building) {
  try {
    if (getApps().length === 0) {
      if (
        FIREBASE_PRIVATE_KEY &&
        FIREBASE_PRIVATE_KEY.includes('-----BEGIN PRIVATE KEY-----') &&
        !FIREBASE_PRIVATE_KEY.includes('...')
      ) {
        initializeApp({
          credential: cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: FIREBASE_CLIENT_EMAIL,
            privateKey: FIREBASE_PRIVATE_KEY,
          }),
        })
      } else {
        initializeApp({
          projectId: FIREBASE_PROJECT_ID || 'demo-gbstem',
        })
      }
    }
  } catch (err: any) {
    if (!/already exists/u.test(err.message)) {
      console.error('Firebase Admin init error:', err)
    }
  }
  adminAuth = getAuth()
  adminDb = getFirestore()
} else {
  adminAuth = {} as Auth
  adminDb = {} as Firestore
}
