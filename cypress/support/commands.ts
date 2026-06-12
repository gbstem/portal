// Add all new commands to index.d.ts as well.

Cypress.Commands.add('fillInput', (selector: string, text: string) => {
  cy.get(selector)
    .should('be.visible')
    .focus()
    .clear()
    .type(text, { delay: 20 })
  cy.get(selector).then(($el) => {
    if ($el.val() !== text) {
      cy.get(selector)
        .clear()
        .type(text, { delay: 50 })
        .should('have.value', text)
    }
  })
})

Cypress.Commands.add('signedInSession', (role: string) => {
  cy.session(`signedIn-${role}`, () => {
    cy.visit('/signin')
    cy.get('input[type="email"]').should('be.visible')
    cy.wait(2500) // Wait for Svelte page and HMR to settle
    const email =
      role === 'admin'
        ? 'demo@gbstem.org'
        : role === 'instructor'
          ? 'instructor@gbstem.org'
          : 'student@gbstem.org'
    const password = 'penguin'

    cy.fillInput('input[type="email"]', email)
    cy.fillInput('input[type="password"]', password)
    cy.get('button[type="submit"]').click()

    cy.url().should('include', '/dashboard')
    cy.get('h1').should('contain', 'Dashboard')
  })
})

Cypress.Commands.add('signOutViaUi', () => {
  cy.get('body').then(($body) => {
    if ($body.find('button[aria-label="Profile menu"]:visible').length > 0) {
      cy.get('button[aria-label="Profile menu"]').click()
    }
  })
  cy.contains('button', 'Sign out').click({ force: true })
  cy.url().should('include', '/signin')
  cy.get('input[type="email"]').should('be.visible')
})

Cypress.Commands.add('selectOption', (selector: string, text: string) => {
  cy.get(selector).click({ force: true })
  cy.wait(300)
  cy.contains('button', text).click({ force: true })
})

Cypress.Commands.add('parseCopiedEmails', (clipboardText: string) => {
  const emails = clipboardText.split(',').map((e: string) => e.trim())
  return cy.wrap(emails)
})

Cypress.Commands.add(
  'getLatestOobLink',
  (
    email: string,
    requestType: 'VERIFY_EMAIL' | 'PASSWORD_RESET' | 'VERIFY_AND_CHANGE_EMAIL',
  ) => {
    return cy
      .request(
        'GET',
        'http://127.0.0.1:9099/emulator/v1/projects/demo-gbstem/oobCodes',
      )
      .then((response) => {
        const codes = response.body.oobCodes || []
        const match = codes
          .filter((c: any) => {
            const emailMatch = c.email === email || c.newEmail === email
            return emailMatch && c.requestType === requestType
          })
          .pop()
        expect(match).to.not.equal(undefined)
        return match.oobLink
      })
  },
)

Cypress.Commands.add(
  'waitForNotification',
  (text: string, timeoutMs: number = 15000) => {
    return cy
      .get(
        'div.fixed.bottom-3 .bg-green-200, div.fixed.bottom-3 .bg-red-200, div.fixed.bottom-3 .bg-gray-200',
        { timeout: timeoutMs },
      )
      .should('contain', text)
  },
)

const getFirebaseAuthBaseUrl = () =>
  `http://${Cypress.expose('FIREBASE_AUTH_EMULATOR_HOST') || '127.0.0.1:9099'}`
const getFirestoreBaseUrl = () =>
  `http://${Cypress.expose('FIRESTORE_EMULATOR_HOST') || '127.0.0.1:8080'}`

Cypress.Commands.add('getFirebaseAuthToken', () => {
  return cy
    .request({
      method: 'POST',
      url: `${getFirebaseAuthBaseUrl()}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=does-not-matter`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        email: 'demo@gbstem.org',
        password: 'penguin',
        returnSecureToken: true,
      },
    })
    .then((response) => {
      return response.body.idToken
    })
})

Cypress.Commands.add(
  'getFirestoreUserId',
  (authToken: string, email: string) => {
    return cy
      .request({
        method: 'POST',
        url: `${getFirebaseAuthBaseUrl()}/identitytoolkit.googleapis.com/v1/projects/demo-gbstem/accounts:lookup?key=does-not-matter`,
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: {
          email: [email],
        },
      })
      .then((response) => {
        const user = response.body.users[0]
        const userId = user.localId
        cy.log(`Successfully got ${email} with UID: ${userId}`)
        return userId
      })
  },
)

const convertValue = (val: any): any => {
  if (!val) return null
  if ('stringValue' in val) return val.stringValue
  if ('integerValue' in val) return parseInt(val.integerValue, 10)
  if ('doubleValue' in val) return parseFloat(val.doubleValue)
  if ('booleanValue' in val) return val.booleanValue
  if ('arrayValue' in val) {
    const values = val.arrayValue.values || []
    return values.map(convertValue)
  }
  if ('mapValue' in val) {
    const fields = val.mapValue.fields || {}
    const obj: any = {}
    for (const key of Object.keys(fields)) {
      obj[key] = convertValue(fields[key])
    }
    return obj
  }
  if ('nullValue' in val) return null
  return val
}

Cypress.Commands.add(
  'getFirestoreDoc',
  (authToken: string, collection: string, docId: string) => {
    return cy
      .request({
        method: 'GET',
        url: `${getFirestoreBaseUrl()}/v1/projects/demo-gbstem/databases/(default)/documents/${collection}/${docId}`,
        failOnStatusCode: false,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })
      .then((response) => {
        if (response.status === 404) {
          return null
        }
        expect(response.status).to.equal(200)

        const fields = response.body.fields || {}
        const data: any = {}
        for (const key of Object.keys(fields)) {
          data[key] = convertValue(fields[key])
        }
        return data
      })
  },
)
