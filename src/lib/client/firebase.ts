import {
  PUBLIC_FIREBASE_API_KEY,
  PUBLIC_FIREBASE_AUTH_DOMAIN,
  PUBLIC_FIREBASE_PROJECT_ID,
  PUBLIC_FIREBASE_STORAGE_BUCKET,
  PUBLIC_FIREBASE_MESSAGE_SENDER_ID,
  PUBLIC_FIREBASE_APP_ID,
  PUBLIC_FIREBASE_MEASUREMENT_ID,
} from '$env/static/public'
import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { readable } from 'svelte/store'

const config = {
  apiKey: PUBLIC_FIREBASE_API_KEY,
  authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: PUBLIC_FIREBASE_MESSAGE_SENDER_ID,
  appId: PUBLIC_FIREBASE_APP_ID,
  measurementId: PUBLIC_FIREBASE_MEASUREMENT_ID,
}

import { dev, browser } from '$app/environment'
import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { connectStorageEmulator } from 'firebase/storage'

initializeApp(config)
export const auth = getAuth()
export const db = getFirestore()
export const storage = getStorage()

if (browser && dev) {
  if (
    PUBLIC_FIREBASE_PROJECT_ID &&
    (PUBLIC_FIREBASE_PROJECT_ID.startsWith('demo-') ||
      PUBLIC_FIREBASE_API_KEY.includes('AIzaSyA1234567890'))
  ) {
    console.log('Connecting Firebase client SDKs to local emulators...')
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099')
      connectFirestoreEmulator(db, '127.0.0.1', 8080)
      connectStorageEmulator(storage, '127.0.0.1', 9199)
    } catch (err) {
      console.warn('Failed to connect to Firebase emulators:', err)
    }
  }
}

function userStore() {
  const { subscribe } = readable<Data.User.Store | null | undefined>(
    undefined,
    (set) => {
      return onAuthStateChanged(auth, (userObject) => {
        if (userObject) {
          if (!userObject.emailVerified) {
            localStorage.setItem('emailVerified', 'false')
          }
          getDoc(doc(db, 'users', userObject.uid)).then(async (res) => {
            const userProfile = res.data()
            set({
              object: userObject,
              profile: userProfile as Data.User.Profile,
            })
          })
        } else {
          set(null)
        }
      })
    },
  )
  async function loaded() {
    return new Promise((resolve) => {
      const unsubscribe = subscribe((userData) => {
        if (userData !== undefined) {
          unsubscribe()
          resolve(true)
        }
      })
    })
  }
  return {
    subscribe,
    loaded,
  }
}

export const user = userStore()
