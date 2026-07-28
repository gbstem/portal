import { currentSemester } from '../../src/lib/data/collections'
import { generateDateHash } from '../support/utils'

describe('Section F: Profile Customization & Account Management', () => {
  it('Test Case 12: Profile Modifications & Reauthentication', () => {
    const emailPrefix = generateDateHash('profile')
    const initialEmail = `${emailPrefix}@gbstem.org`
    const updatedEmail = `${emailPrefix}-new@gbstem.org`
    const initialPassword = 'password123'
    const newPassword = 'newpassword123'

    // 1. Sign up a new user to prevent breaking demo seed accounts
    cy.loadSignupPage()
    cy.selectOption(
      'input[name="role"]',
      'Parent registering my child for classes',
      { timeout: 10000 },
    )
    cy.fillInput('input[name="firstName"]', 'Profile')
    cy.fillInput('input[name="lastName"]', 'Test')
    cy.fillInput('input[name="email"]', initialEmail)
    cy.fillInput('input[name="password"]', initialPassword)
    cy.fillInput('input[name="confirmPassword"]', initialPassword)
    cy.contains('button', 'Sign up').click()

    // Handle verification dialog
    cy.get('[role="dialog"]').contains('button', 'Go to dashboard').click()
    cy.getLatestOobLink(initialEmail, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    // Visit profile
    cy.visit('/profile')
    cy.wait(2000)

    // 2. Update Full Name
    cy.get('input[name="firstName"]').should('have.value', 'Profile')
    cy.get('input[name="lastName"]').should('have.value', 'Test')
    cy.fillInput('input[name="firstName"]', 'UpdatedFirst')
    cy.fillInput('input[name="lastName"]', 'UpdatedLast')
    cy.get('input[name="lastName"]')
      .closest('.items-end')
      .contains('button', 'Update')
      .click()
    cy.waitForNotification('Name successfully updated.')
    cy.get('input[name="firstName"]').should('have.value', 'UpdatedFirst')
    cy.get('input[name="lastName"]').should('have.value', 'UpdatedLast')

    // Verify persistence after reload
    cy.visit('/profile')
    cy.wait(1000)
    cy.get('input[name="firstName"]').should('have.value', 'UpdatedFirst')
    cy.get('input[name="lastName"]').should('have.value', 'UpdatedLast')

    // 3. Change Email
    cy.fillInput('input[name="newEmail"]', updatedEmail)
    cy.get('input[name="newEmail"]')
      .closest('.items-end')
      .contains('button', 'Update')
      .click()

    // Reauthenticate Dialog
    cy.get('[role="dialog"]')
      .last()
      .within(() => {
        cy.get('input[name="password"]').type(initialPassword)
        cy.contains('button', 'Reauthenticate').click()
      })
    cy.waitForNotification('A verification email was sent.', 'bg-gray-200')

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
      .closest('.items-end')
      .contains('button', 'Update')
      .click()

    // Reauthenticate Dialog
    cy.get('[role="dialog"]')
      .last()
      .within(() => {
        cy.get('input[name="password"]').clear().type(initialPassword)
        cy.contains('button', 'Reauthenticate').click()
      })
    cy.waitForNotification('Password was successfully changed.')
    cy.get('input[name="newPassword"]').should('have.value', '')
    cy.get('input[name="confirmPassword"]').should('have.value', '')

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

  it('Test Case 13: Deleting An Instructor Account Removes Their Application', () => {
    const emailPrefix = generateDateHash('delete-instructor')
    const email = `${emailPrefix}@gbstem.org`
    const password = 'password123'

    cy.loadSignupPage()
    cy.selectOption(
      'input[name="role"]',
      'High school/college student applying to be an instructor',
      { timeout: 10000 },
    )
    cy.fillInput('input[name="firstName"]', 'DeleteMe')
    cy.fillInput('input[name="lastName"]', 'Instructor')
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', password)
    cy.fillInput('input[name="confirmPassword"]', password)
    cy.contains('button', 'Sign up').click()
    cy.get('[role="dialog"]').contains('button', 'Go to dashboard').click()
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    // Visiting /apply as an instructor auto-creates a draft application doc.
    cy.visit('/apply')
    cy.wait(2000)

    // getFirestoreUserId/checkFirestoreDocExists use the Admin SDK (cypress.config.ts task),
    // which bypasses firestore.rules - unlike a plain cy.request() against the Firestore REST
    // API, which enforces them and would 403 for this unauthenticated check.
    cy.task('getFirestoreUserId', email).then((uid) => {
      expect(uid).to.be.a('string')
      expect((uid as string).length).to.be.greaterThan(0)

      const applicationDocPath = `semesters/${currentSemester}/applications/${uid}`

      // Confirm the application doc actually exists before deletion, so the "gone after
      // deletion" check below can't be a false pass from it never having been created.
      cy.task('checkFirestoreDocExists', applicationDocPath).should('eq', true)

      cy.visit('/profile')
      cy.wait(1000)
      cy.contains('button', 'Delete account').click()
      cy.get('[role="dialog"]')
        .last()
        .within(() => {
          cy.get('input[name="password"]').clear().type(password)
          cy.contains('button', 'Delete').click()
        })
      cy.url().should('include', '/signin', { timeout: 10000 })

      cy.task('checkFirestoreDocExists', applicationDocPath).should('eq', false)
    })
  })
})
