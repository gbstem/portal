import { derived, readable } from 'svelte/store'
import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import {
  PUBLIC_FIREBASE_API_KEY,
  PUBLIC_FIREBASE_AUTH_DOMAIN,
  PUBLIC_FIREBASE_PROJECT_ID,
  PUBLIC_FIREBASE_STORAGE_BUCKET,
  PUBLIC_FIREBASE_MESSAGE_SENDER_ID,
  PUBLIC_FIREBASE_APP_ID,
  PUBLIC_FIREBASE_MEASUREMENT_ID,
} from '$env/static/public'

const useEmulators = (PUBLIC_FIREBASE_API_KEY ?? '') === ''
let config
if (useEmulators) {
  config = {
    projectId: 'test',
    appId: 'test',
    apiKey: 'test',
  }
} else {
  config = {
    apiKey: PUBLIC_FIREBASE_API_KEY,
    authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: PUBLIC_FIREBASE_MESSAGE_SENDER_ID,
    appId: PUBLIC_FIREBASE_APP_ID,
    measurementId: PUBLIC_FIREBASE_MEASUREMENT_ID,
  }
}

export const app = readable(initializeApp(config))

function createAuth() {
  let auth
  const { subscribe } = derived(app, ($app, set) => {
    auth = getAuth($app)
    if (useEmulators)
      connectAuthEmulator(auth, 'http://localhost:9099', {
        disableWarnings: true,
      })
    set(auth)
  })
  async function signUp(email, password, profile) {
    const {
      createUserWithEmailAndPassword,
      sendEmailVerification,
      updateProfile,
    } = await import('firebase/auth')
    const res = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(res.user, profile)
    sendEmailVerification(res.user)
    return res
  }
  async function signIn(email, password) {
    const { signInWithEmailAndPassword } = await import('firebase/auth')
    return await signInWithEmailAndPassword(auth, email, password)
  }
  async function signOut() {
    const { signOut: firebaseSignOut } = await import('firebase/auth')
    return await firebaseSignOut(auth)
  }
  // TODO: reimplement if time remaining and make sure to ref https://developers.google.com/identity/branding-guidelines
  // async function signInWithGoogle() {
  //   const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')
  //   const provider = new GoogleAuthProvider()
  //   return await signInWithPopup(auth, provider)
  // }
  return {
    subscribe,
    signUp,
    signIn,
    signOut,
  }
}

export const auth = createAuth()

function createUser() {
  let user = undefined
  const { subscribe } = derived(auth, ($auth, set) => {
    set(user)
    const unsubscribe = onAuthStateChanged($auth, (userData) => {
      user = userData
      set(user)
    })
    return unsubscribe
  })
  async function loaded() {
    let unsubscribe
    const userData = new Promise((resolve) => {
      unsubscribe = subscribe((userData) => {
        if (userData !== undefined) {
          resolve(true)
        }
      })
    })
    return new Promise((resolve) => {
      userData.then((result) => {
        unsubscribe()
        resolve(result)
      })
    })
  }
  async function get() {
    await loaded()
    return user
  }
  async function isSignedIn() {
    await loaded()
    return Boolean(user)
  }
  return {
    subscribe,
    loaded,
    get,
    isSignedIn,
  }
}

export const user = createUser()

export const db = derived(app, ($app, set) => {
  const db = getFirestore($app)
  if (useEmulators) connectFirestoreEmulator(db, 'localhost', 8080)
  set(db)
})

function createStorage() {
  let storage = undefined
  const { subscribe } = derived(app, ($app, set) => {
    storage = getStorage($app)
    if (useEmulators) connectStorageEmulator(storage, 'http://127.0.0.1:9199')
    set(storage)
  })
  async function loaded() {
    let unsubscribe
    const storageData = new Promise((resolve) => {
      unsubscribe = subscribe((storageData) => {
        if (storageData !== undefined) {
          resolve(true)
        }
      })
    })
    return new Promise((resolve) => {
      storageData.then((result) => {
        unsubscribe()
        resolve(result)
      })
    })
  }
  async function uploadFile(file, filePath) {
    await loaded()
    const { ref, uploadBytes, getDownloadURL } = await import(
      'firebase/storage'
    )
    const fileRef = ref(storage, filePath)
    return new Promise((resolve, reject) =>
      uploadBytes(fileRef, file)
        .then(() => {
          getDownloadURL(fileRef).then((url) => {
            resolve(url)
          })
        })
        .catch(reject)
    )
  }
  return {
    subscribe,
    loaded,
    uploadFile,
  }
}

export const storage = createStorage()
