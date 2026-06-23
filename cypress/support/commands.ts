// Add all new commands to index.d.ts as well.

Cypress.Commands.add('fillInput', (selector: string, text: string) => {
  cy.get(selector)
    .scrollIntoView()
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

Cypress.Commands.add('loadSignupPage', () => {
  cy.visit('/signup')
  cy.get('h1').should('contain', 'Sign up')
  cy.get('input[name="firstName"]').should('be.visible')
  cy.wait(2500) // Wait for signup initialization and HMR/Firebase to settle
})

Cypress.Commands.add(
  'signedInSession',
  (
    role: 'admin' | 'instructor' | 'reviewer' | 'student',
    options: {
      email?: string
      initialPage?: string
    } = {},
  ) => {
    const emailToUse =
      options.email ||
      (role === 'admin' ? 'demo@gbstem.org' : `${role}@gbstem.org`)

    cy.session(`signedIn-${emailToUse}`, () => {
      cy.visit('/signin')
      cy.get('input[type="email"]').should('be.visible')
      cy.wait(2500) // Wait for Svelte page and HMR to settle
      const password = 'penguin'

      cy.fillInput('input[type="email"]', emailToUse)
      cy.fillInput('input[type="password"]', password)
      cy.get('button[type="submit"]').click()
      cy.wait(1000) // Wait for Svelte page and HMR to settle
    })

    const initialPage = options.initialPage || '/dashboard'
    cy.visit(initialPage)
    if (initialPage === '/announcements') {
      cy.title().should('contain', 'Announcements')
      cy.get('h1').should('contain', 'Announcements', { timeout: 10000 })
    } else if (initialPage === '/apply') {
      cy.title().should('contain', 'Apply')
      if (role === 'instructor') {
        cy.get('h1').should('contain', 'Apply', { timeout: 10000 })
      } else {
        cy.get('h1').should('contain', 'Student Account Creation', {
          timeout: 10000,
        })
      }
    } else if (initialPage === '/classes') {
      cy.title().should('contain', 'Classes Overview')
    } else if (initialPage === '/community-service') {
      cy.title().should('contain', 'Community Service Hours Tracker')
      cy.get('h1').should('contain', 'Community Service Hours Tracker', {
        timeout: 10000,
      })
    } else if (initialPage === '/curriculum') {
      cy.title().should('contain', 'Curriculum')
      cy.get('h1').should('contain', 'Curriculum', { timeout: 10000 })
    } else if (initialPage === '/dashboard') {
      cy.title().should('contain', 'Dashboard')
      cy.get('h1').should('contain', 'Dashboard', { timeout: 10000 })
    } else if (initialPage === '/faq') {
      cy.title().should('contain', 'FAQ')
      cy.get('h1').should('contain', 'FAQ', { timeout: 10000 })
    } else if (initialPage === '/interview') {
      cy.title().should('contain', 'Schedule Your Interview')
      cy.get('h1').should('contain', 'Schedule Your Interview', {
        timeout: 10000,
      })
    } else if (initialPage === '/profile') {
      cy.title().should('contain', 'Profile')
      cy.get('h1').should('contain', 'Profile', { timeout: 10000 })
    }
  },
)

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
  (
    text: string,
    colorClass: string = 'bg-green-200',
    timeoutMs: number = 15000,
  ) => {
    return cy
      .get(`div.fixed.bottom-3 .${colorClass}`, { timeout: timeoutMs })
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
    return cy.task('getFirestoreUserId', email).then((uid) => {
      if (!uid) {
        throw new Error(`Could not find user ID for email: ${email}`)
      }
      return uid as string
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

Cypress.Commands.add(
  'setFirestoreDoc',
  (authToken: string, collection: string, docId: string, data: any) => {
    const fields: any = {}
    for (const key of Object.keys(data)) {
      const val = data[key]
      if (typeof val === 'string') {
        fields[key] = { stringValue: val }
      } else if (typeof val === 'boolean') {
        fields[key] = { booleanValue: val }
      } else if (typeof val === 'number') {
        fields[key] = { doubleValue: val }
      }
    }
    return cy.request({
      method: 'PATCH',
      url: `${getFirestoreBaseUrl()}/v1/projects/demo-gbstem/databases/(default)/documents/${collection}/${docId}`,
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: { fields },
    })
  },
)
