import { defineConfig } from 'cypress'
import installLogsPrinter from 'cypress-terminal-report/src/installLogsPrinter'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { exec as execCallback } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { promisify } from 'util'

const exec = promisify(execCallback)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadEnv() {
  const env: Record<string, string> = {}
  for (const filename of ['.env', '.env.local']) {
    const filePath = path.resolve(__dirname, filename)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const match = trimmed.match(/^([^=]+)=(.*)$/)
        if (match) {
          const key = match[1].trim()
          let val = match[2].trim()
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1)
          }
          env[key] = val
        }
      }
    }
  }
  return { ...env, ...process.env }
}

const combinedEnv = loadEnv()

// Ensure emulator and project env variables are set for firebase-admin and other tools
if (combinedEnv.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    combinedEnv.FIREBASE_AUTH_EMULATOR_HOST
}
if (combinedEnv.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = combinedEnv.FIRESTORE_EMULATOR_HOST
}
if (combinedEnv.FIREBASE_PROJECT_ID) {
  process.env.FIREBASE_PROJECT_ID = combinedEnv.FIREBASE_PROJECT_ID
  process.env.GCLOUD_PROJECT = combinedEnv.FIREBASE_PROJECT_ID
}

export default defineConfig({
  // Cypress 16 deprecated bundled Electron as the implicit default browser.
  defaultBrowser: 'chrome',
  // Public, non-sensitive configuration values
  expose: {
    FIRESTORE_EMULATOR_HOST: combinedEnv.FIRESTORE_EMULATOR_HOST,
  },
  // Sensitive values like API keys, passwords, tokens, or credentials
  env: {},
  e2e: {
    baseUrl: 'http://localhost:5173',
    scrollBehavior: 'center',
    viewportWidth: 1920,
    viewportHeight: 1080,
    setupNodeEvents(on, config) {
      installLogsPrinter(on, {
        printLogsToConsole: 'onFail',
        printLogsToFile: 'always',
        includeSuccessfulHookLogs: false,
        outputRoot: config.projectRoot + '/cypress/logs/',
        outputTarget: {
          'out.json': 'json',
        },
      })
      on('task', {
        log(message) {
          console.log(message) // Print to the terminal
          return null
        },
        // Restores the shared emulator to admin's seed state. Portal has no
        // seed data of its own - see cypress/support/e2e.ts and README's
        // Cypress section for why this shells into the sibling ../admin
        // checkout (`cd ../admin && yarn seed` rather than `yarn --cwd
        // ../admin seed`, for the same Corepack/packageManager-pin reason
        // documented there) instead of duplicating admin's seed script.
        // This is a cy.task() rather than the removed cy.exec() only because
        // Cypress 16 dropped cy.exec(); the underlying command is unchanged.
        async seed() {
          const { stdout, stderr } = await exec('cd ../admin && yarn seed')
          if (stdout) console.log(stdout)
          if (stderr) console.error(stderr)
          return null
        },
        async getFirestoreUserId(email: string) {
          if (getApps().length === 0) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'demo-gbstem',
            })
          }
          try {
            const userRecord = await getAuth().getUserByEmail(email)
            return userRecord.uid
          } catch (error) {
            console.error('Error in getFirestoreUserId task:', error)
            return null
          }
        },
        // Admin SDK access bypasses firestore.rules (unlike a plain cy.request() against the
        // Firestore REST API, which enforces them and 403s for an unauthenticated caller) -
        // needed for tests asserting server-side document state directly, such as confirming a
        // doc was actually deleted rather than just reflected in optimistic UI state.
        async checkFirestoreDocExists(docPath: string) {
          if (getApps().length === 0) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'demo-gbstem',
            })
          }
          const doc = await getFirestore().doc(docPath).get()
          return doc.exists
        },
        // Admin SDK merge-write, bypassing firestore.rules - lets a spec put a
        // seeded doc into a state the app itself would never write (e.g. a
        // stale interviewerEmail/instructorEmail predating an account email
        // change), to exercise a fallback path directly.
        async mergeFirestoreDoc({
          docPath,
          data,
        }: {
          docPath: string
          data: Record<string, unknown>
        }) {
          if (getApps().length === 0) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'demo-gbstem',
            })
          }
          await getFirestore().doc(docPath).set(data, { merge: true })
          return null
        },
      })
      return config
    },
  },
})
