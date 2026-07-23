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

  // TODO(dmeyer246) Ensure this gets enabled, run, and succeeds. Then remove the overly verbose
  // test case comment below.
  //
  // Regression test for SEMESTER_MIGRATION_PLAN.md § 10.2: DeleteAccountForm.svelte deleted
  // the application doc via a hardcoded `doc(db, 'applications', uid)` instead of the imported
  // `applicationsCollection` constant, which has no matching security rule under either the old
  // or new schema and fails with permission-denied — silently, because the surrounding
  // `.map((p) => p.catch((e) => e))` swallows the error. Test Case 12 above already exercises
  // the delete-account UI flow end-to-end, but its test user signs up with the "Parent
  // registering my child for classes" role, which never has an application doc in the first
  // place (only the "instructor" role does, via ApplyForm), so it would not have caught this
  // bug even with a Firestore assertion added to it.
  //
  // SKIPPED: needs an instructor-role signup, a visit to /apply (ApplyForm auto-creates a draft
  // application doc on mount — see ApplyForm.svelte's onMount/handleSave), then a direct
  // Firestore emulator REST check (following the same `cy.request` pattern getLatestOobLink uses
  // against the Auth emulator, at `127.0.0.1:8080/v1/projects/demo-gbstem/databases/(default)/
  // documents/semesters/{currentSemester}/applications/{uid}`, expecting 404) after deletion —
  // none of which has been runtime-verified yet. Un-skip once verified during the Phase 4
  // emulator rehearsal.
  it.skip('Test Case 13: Deleting An Instructor Account Removes Their Application (TODO: verify Firestore REST assertion works)', () => {
    const emailPrefix = generateDateHash('delete-instructor')
    const email = `${emailPrefix}@gbstem.org`
    const password = 'password123'

    cy.loadSignupPage()
    cy.selectOption(
      'input[name="role"]',
      'High school/college student applying to be an instructor',
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

    // TODO: capture the signed-up user's uid (e.g. via a custom command reading it off the
    // Auth emulator, mirroring getLatestOobLink's REST call) so it can be used below.
    const uid = 'TODO_CAPTURE_UID'

    // Visiting /apply as an instructor auto-creates a draft application doc.
    cy.visit('/apply')
    cy.wait(2000)

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

    // TODO: replace 'Spring26' with the live currentSemester export once this test is wired up.
    cy.request({
      method: 'GET',
      url: `http://127.0.0.1:8080/v1/projects/demo-gbstem/databases/(default)/documents/semesters/Spring26/applications/${uid}`,
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.eq(404)
    })
  })
})
