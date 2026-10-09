import { defineEnvVars } from '@sveltejs/kit/env'

/**
 * For a variable that may be unset: the value as given, `undefined` when
 * missing. Without a `schema`, SvelteKit refuses to start unless it's set.
 */
const optional = (value: string | undefined) => value

export const variables = defineEnvVars({
  // Entra credentials for /api/meetingLink, which explains why they're
  // optional and why the legacy VITE_* names are still here.
  MS_CLIENT_ID: { schema: optional },
  VITE_CLIENT_ID: { schema: optional },
  MS_CLIENT_SECRET: { schema: optional },
  VITE_CLIENT_SECRET: { schema: optional },
  MS_TENANT_ID: { schema: optional },
  VITE_TENTANT_ID: { schema: optional },
  MS_CALENDAR_USER: { schema: optional },
  SENDGRID_API_TOKEN: { static: true },
  // Set only when running against the Firebase emulators.
  FIREBASE_AUTH_EMULATOR_HOST: { schema: optional },
  FIRESTORE_EMULATOR_HOST: { schema: optional },
  STORAGE_EMULATOR_HOST: { schema: optional },
  // Due-date overrides for Cypress, honoured only alongside
  // FIRESTORE_EMULATOR_HOST - see #lib/server/semesterWindows.
  E2E_INSTRUCTOR_APPS_DUE: { schema: optional },
  E2E_REGISTRATIONS_DUE: { schema: optional },
  FIREBASE_CLIENT_EMAIL: { static: true },
  FIREBASE_PRIVATE_KEY: { static: true },
  FIREBASE_PROJECT_ID: { static: true },
  PUBLIC_FIREBASE_API_KEY: { public: true, static: true },
  PUBLIC_FIREBASE_APP_ID: { public: true, static: true },
  PUBLIC_FIREBASE_AUTH_DOMAIN: { public: true, static: true },
  PUBLIC_FIREBASE_MEASUREMENT_ID: { public: true, static: true },
  PUBLIC_FIREBASE_MESSAGE_SENDER_ID: { public: true, static: true },
  PUBLIC_FIREBASE_PROJECT_ID: { public: true, static: true },
  PUBLIC_FIREBASE_STORAGE_BUCKET: { public: true, static: true },
})
