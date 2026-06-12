import { generateDateHash } from '../support/utils'

describe('Section F: Profile Customization & Account Management', () => {
  beforeEach(() => {
    cy.clearAllCookies()
    cy.clearAllLocalStorage()
    cy.clearAllSessionStorage()
  })

  it('Test Case 12: Profile Modifications & Reauthentication', () => {
    const emailPrefix = generateDateHash('profile')
    const initialEmail = `${emailPrefix}@gbstem.org`
    const updatedEmail = `${emailPrefix}-new@gbstem.org`
    const initialPassword = 'password123'
    const newPassword = 'newpassword123'

    // 1. Sign up a new user to prevent breaking demo seed accounts
    cy.visit('/signup')
    cy.wait(2500) // Wait for signup initialization
    cy.selectOption(
      'input[name="role"]',
      'Parent registering my child for classes',
    )
    cy.fillInput('input[name="firstName"]', 'Profile')
    cy.fillInput('input[name="lastName"]', 'Test')
    cy.fillInput('input[name="email"]', initialEmail)
    cy.fillInput('input[name="password"]', initialPassword)
    cy.fillInput('input[name="confirmPassword"]', initialPassword)
    cy.get('button[type="submit"]').click()

    // Handle verification dialog
    cy.get('[role="dialog"]').contains('button', 'Go to dashboard').click()
    cy.getLatestOobLink(initialEmail, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    // Visit profile
    cy.visit('/profile')
    cy.wait(2000)

    // 2. Update Full Name
    cy.fillInput('input[name="firstName"]', 'UpdatedFirst')
    cy.fillInput('input[name="lastName"]', 'UpdatedLast')
    cy.get('form').first().find('button[type="submit"]').click()
    cy.waitForNotification('Name successfully updated.')

    // Verify persistence after reload
    cy.visit('/profile')
    cy.wait(1000)
    cy.get('input[name="firstName"]').should('have.value', 'UpdatedFirst')
    cy.get('input[name="lastName"]').should('have.value', 'UpdatedLast')

    // 3. Change Email
    cy.fillInput('input[name="newEmail"]', updatedEmail)
    cy.contains('button', 'Update').first().click()

    // Reauthenticate Dialog
    cy.get('[role="dialog"]')
      .last()
      .within(() => {
        cy.get('input[name="password"]').type(initialPassword)
        cy.contains('button', 'Reauthenticate').click()
      })
    cy.waitForNotification('A verification email was sent.')

    // Retrieve link and verify/confirm email change
    cy.getLatestOobLink(updatedEmail, 'VERIFY_AND_CHANGE_EMAIL').then(
      (link) => {
        cy.request(link)
      },
    )

    // Reload and verify email field shows the updated email
    cy.visit('/profile')
    cy.wait(2000)
    cy.get('input[id="current-email"]').should('have.value', updatedEmail)

    // 4. Change Password
    cy.fillInput('input[name="newPassword"]', newPassword)
    cy.fillInput('input[name="confirmPassword"]', newPassword)
    cy.get('input[name="confirmPassword"]')
      .parent()
      .find('button[type="submit"]')
      .click()

    // Reauthenticate Dialog
    cy.get('[role="dialog"]')
      .last()
      .within(() => {
        cy.get('input[name="password"]').clear().type(initialPassword)
        cy.contains('button', 'Reauthenticate').click()
      })
    cy.waitForNotification('Password was successfully changed.')

    // 5. Delete Account
    cy.contains('button', 'Delete account').click()
    cy.get('[role="dialog"]')
      .last()
      .within(() => {
        cy.get('input[name="password"]').clear().type(newPassword)
        cy.contains('button', 'Delete').click()
      })
    cy.url().should('include', '/signin', { timeout: 10000 })
  })
})
