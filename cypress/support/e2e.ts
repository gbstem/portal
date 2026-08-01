// Import commands.js using ES2015 syntax:
import './commands'

import installLogsCollector from 'cypress-terminal-report/src/installLogsCollector'
installLogsCollector()

Cypress.on('uncaught:exception', (err) => {
  // Ignore connection drops/failures from Firebase/Firestore emulator
  if (
    err.name === 'FirebaseError' ||
    err.message.includes('Connection failed') ||
    err.message.includes('FirebaseError') ||
    err.message.includes('FIRESTORE') ||
    err.message.includes('Null value error') ||
    err.message.includes('client is offline') ||
    err.message.includes('Failed to fetch')
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

  // Restore the emulator database to the seed state to ensure tests are deterministic.
  // This assumes the admin repository is checked out in a parallel directory.
  //
  // `cd ../admin && yarn seed` rather than `yarn --cwd ../admin seed`: Corepack
  // resolves the Yarn version from the *current* directory, not from --cwd's
  // target. That only works here as long as the directory Cypress runs from
  // pins "packageManager" in its package.json -- cd'ing first reads the pin
  // from admin's own package.json and does not depend on where we started.
  cy.exec('cd ../admin && yarn seed', { timeout: 120000 })
})
