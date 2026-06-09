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
  cy.get(selector).then(($el) => {
    const el = $el[0] as HTMLInputElement
    el.value = text
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  cy.wait(300)
  cy.get(selector).type('{enter}', { force: true })
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
      .get('.bg-green-200', { timeout: timeoutMs })
      .should('contain', text)
  },
)
