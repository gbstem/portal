import { building } from '$app/environment'
import {
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_PROJECT_ID,
} from '$env/static/private'
import firebase from 'firebase-admin'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

export let adminAuth: any
export let adminDb: any

if (!building) {
  try {
    firebase.initializeApp({
      credential: firebase.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY,
      }),
    })
    //  eslint-disable-next-line @typescript-eslint/no-explicit-any
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
