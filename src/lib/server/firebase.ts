import { building } from '$app/environment'
import { env } from '$env/dynamic/private'
import {
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_PROJECT_ID,
} from '$env/static/private'
import { cleanEnvVar } from '$lib/utils'

// Copy and clean emulator environment variables to process.env so firebase-admin can detect them
const authHost = cleanEnvVar(
  env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST,
)
const firestoreHost = cleanEnvVar(
  env.FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST,
)
const storageHost = cleanEnvVar(
  env.STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST,
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

import firebase from 'firebase-admin'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

export let adminAuth: any
export let adminDb: any

if (!building) {
  try {
    if (
      FIREBASE_PRIVATE_KEY &&
      FIREBASE_PRIVATE_KEY.includes('-----BEGIN PRIVATE KEY-----') &&
      !FIREBASE_PRIVATE_KEY.includes('...')
    ) {
      firebase.initializeApp({
        credential: firebase.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY,
        }),
      })
    } else {
      firebase.initializeApp({
        projectId: FIREBASE_PROJECT_ID || 'demo-gbstem',
      })
    }
  } catch (err: any) {
    if (!/already exists/u.test(err.message)) {
      console.log('Firebase Admin Error:', err.stack)
    }
  }
  adminAuth = getAuth()
  adminDb = getFirestore()
} else {
  adminAuth = {}
  adminDb = {}
}
