// Import commands.js using ES2015 syntax:
import './commands'

import installLogsCollector from 'cypress-terminal-report/src/installLogsCollector'
installLogsCollector()

Cypress.on('uncaught:exception', (err) => {
  // Ignore connection drops/failures from Firebase/Firestore emulator
  if (
    err.message.includes('Connection failed') ||
    err.message.includes('FirebaseError') ||
    err.message.includes('FIRESTORE')
  ) {
    return false
  }
  // Let other uncaught exceptions fail the test
})

before(() => {
  // Ensure we're testing against an emulator, not the live site.
  const firestoreHost = Cypress.expose('FIRESTORE_EMULATOR_HOST')
  if (!firestoreHost) {
    throw new Error(
      'Cypress tests use an emulator, but FIRESTORE_EMULATOR_HOST is not defined in your environment',
    )
  }
})
