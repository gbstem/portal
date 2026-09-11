import {
  classesCollection,
  currentSemester,
  decisionsCollection,
  registrationsCollection,
  substituteRequestsCollection,
} from '../../src/lib/data/collections'
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

    // Handle email verification (emulated email side-channel)
    cy.get('[role="dialog"]').contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.getLatestOobLink(initialEmail, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    // Visit profile
    cy.visit('/profile')

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

    // Handle email verification (emulated email side-channel)
    cy.getLatestOobLink(updatedEmail, 'VERIFY_AND_CHANGE_EMAIL').then(
      (link) => {
        cy.request(link)
      },
    )

    // Reload and verify email field shows the updated email
    cy.visit('/profile')
    cy.get('input[id="current-email"]', { timeout: 8000 }).should(
      'have.value',
      updatedEmail,
    )

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

    // Handle email verification (emulated email side-channel)
    cy.get('[role="dialog"]').contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    // Visiting /apply as an instructor auto-creates a draft application doc.
    cy.visit('/apply')
    // Empirically needed: without this, /apply rendered the student-facing
    // "Student Account Creation" form instead of the instructor "Apply" form
    // (verified via a real test run screenshot), meaning the instructor role
    // claim set at signup hadn't yet propagated to this session -- so no
    // draft application doc got created, and the exists-check below failed.
    cy.wait(2000)

    // getFirestoreUserId/checkFirestoreDocExists use the Admin SDK (cypress.config.ts task),
    // which bypasses firestore.rules - unlike a plain cy.request() against the Firestore REST
    // API, which enforces them and would 403 for this unauthenticated check.
    cy.task('getFirestoreUserId', email).then((uid) => {
      expect(uid).to.be.a('string')
      expect((uid as string).length).to.be.greaterThan(0)

      const applicationDocPath = `semesters/${currentSemester}/applications/${uid}`
      // The app itself can never write a decision doc (only admin/reviewer
      // can, per firestore.rules), so seed one directly to confirm account
      // deletion removes it too, bypassing that same rule with the Admin SDK.
      const decisionDocPath = `${decisionsCollection}/${uid}`
      cy.task('mergeFirestoreDoc', {
        docPath: decisionDocPath,
        data: { type: 'accepted' },
      })

      // Confirm both docs actually exist before deletion, so the "gone after
      // deletion" checks below can't be a false pass from them never having
      // been created.
      cy.task('checkFirestoreDocExists', applicationDocPath).should('eq', true)
      cy.task('checkFirestoreDocExists', decisionDocPath).should('eq', true)

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
      cy.task('checkFirestoreDocExists', decisionDocPath).should('eq', false)
    })
  })

  it('Test Case 14: Blocked From Deleting An Instructor Account That Owns A Class', () => {
    const emailPrefix = generateDateHash('delete-blocked-owns-class')
    const email = `${emailPrefix}@gbstem.org`
    const password = 'password123'

    cy.loadSignupPage()
    cy.selectOption(
      'input[name="role"]',
      'High school/college student applying to be an instructor',
      { timeout: 10000 },
    )
    cy.fillInput('input[name="firstName"]', 'Blocked')
    cy.fillInput('input[name="lastName"]', 'Instructor')
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', password)
    cy.fillInput('input[name="confirmPassword"]', password)
    cy.contains('button', 'Sign up').click()

    cy.get('[role="dialog"]').contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    cy.task('getFirestoreUserId', email).then((uid) => {
      expect(uid).to.be.a('string')
      cy.task('mergeFirestoreDoc', {
        docPath: `${classesCollection}/blocked-instructor-class-${emailPrefix}`,
        data: { instructorUid: uid, otherInstructorUids: [] },
      })

      cy.visit('/profile')
      cy.wait(1000)
      cy.contains('button', 'Delete account').click()
      cy.get('[role="dialog"]').last().should('contain', "Can't delete account")
      cy.get('[role="dialog"]')
        .last()
        .should('contain', 'instructor of one or more classes')
      cy.get('[role="dialog"]')
        .last()
        .find('input[type="password"]')
        .should('not.exist')
      cy.get('[role="dialog"]').last().contains('button', 'Close').click()
      cy.get('[role="dialog"]').should('not.exist')

      // The account was never touched.
      cy.task('getFirestoreUserId', email).should('eq', uid)
    })
  })

  it('Test Case 14b: Blocked From Deleting An Instructor Account With A Future Substitute Commitment', () => {
    const emailPrefix = generateDateHash('delete-blocked-sub')
    const email = `${emailPrefix}@gbstem.org`
    const password = 'password123'

    cy.loadSignupPage()
    cy.selectOption(
      'input[name="role"]',
      'High school/college student applying to be an instructor',
      { timeout: 10000 },
    )
    cy.fillInput('input[name="firstName"]', 'Blocked')
    cy.fillInput('input[name="lastName"]', 'Substitute')
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', password)
    cy.fillInput('input[name="confirmPassword"]', password)
    cy.contains('button', 'Sign up').click()

    cy.get('[role="dialog"]').contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    cy.task('getFirestoreUserId', email).then((uid) => {
      expect(uid).to.be.a('string')
      cy.task('mergeFirestoreDoc', {
        docPath: `${substituteRequestsCollection}/blocked-sub-request-${emailPrefix}`,
        data: {
          subInstructorId: uid,
          dateOfClass: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          subRequestStatus: 'SubstituteFound',
        },
      })

      cy.visit('/profile')
      cy.wait(1000)
      cy.contains('button', 'Delete account').click()
      cy.get('[role="dialog"]').last().should('contain', "Can't delete account")
      cy.get('[role="dialog"]')
        .last()
        .should('contain', 'volunteered to substitute')
      cy.get('[role="dialog"]').last().contains('button', 'Close').click()
      cy.get('[role="dialog"]').should('not.exist')

      cy.task('getFirestoreUserId', email).should('eq', uid)
    })
  })

  it('Test Case 15: Deleting A Student Account Removes Its Child Registrations', () => {
    const emailPrefix = generateDateHash('delete-student')
    const email = `${emailPrefix}@gbstem.org`
    const password = 'password123'

    cy.loadSignupPage()
    cy.selectOption(
      'input[name="role"]',
      'Parent registering my child for classes',
      { timeout: 10000 },
    )
    cy.fillInput('input[name="firstName"]', 'DeleteMe')
    cy.fillInput('input[name="lastName"]', 'Parent')
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', password)
    cy.fillInput('input[name="confirmPassword"]', password)
    cy.contains('button', 'Sign up').click()

    cy.get('[role="dialog"]').contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    cy.task('getFirestoreUserId', email).then((uid) => {
      expect(uid).to.be.a('string')
      const registrationDocPath = `${registrationsCollection}/${uid}-1`
      cy.task('mergeFirestoreDoc', {
        docPath: registrationDocPath,
        data: {
          personal: { studentFirstName: 'Kid', studentLastName: 'One' },
          meta: { submitted: false },
          enrolled: false,
          classes: [],
        },
      })
      cy.task('checkFirestoreDocExists', registrationDocPath).should('eq', true)

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

      cy.task('checkFirestoreDocExists', registrationDocPath).should(
        'eq',
        false,
      )
      cy.task('checkFirestoreDocExists', `users/${uid}`).should('eq', false)
      cy.task('getFirestoreUserId', email).should('eq', null)
    })
  })

  it('Test Case 15b: Blocked From Deleting A Student Account With An Enrolled Child', () => {
    const emailPrefix = generateDateHash('delete-blocked-enrolled')
    const email = `${emailPrefix}@gbstem.org`
    const password = 'password123'

    cy.loadSignupPage()
    cy.selectOption(
      'input[name="role"]',
      'Parent registering my child for classes',
      { timeout: 10000 },
    )
    cy.fillInput('input[name="firstName"]', 'Blocked')
    cy.fillInput('input[name="lastName"]', 'Parent')
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', password)
    cy.fillInput('input[name="confirmPassword"]', password)
    cy.contains('button', 'Sign up').click()

    cy.get('[role="dialog"]').contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    cy.task('getFirestoreUserId', email).then((uid) => {
      expect(uid).to.be.a('string')
      cy.task('mergeFirestoreDoc', {
        docPath: `${registrationsCollection}/${uid}-1`,
        data: {
          personal: { studentFirstName: 'Kid', studentLastName: 'Two' },
          meta: { submitted: true },
          enrolled: true,
          classes: ['some-class-id'],
        },
      })

      cy.visit('/profile')
      cy.wait(1000)
      cy.contains('button', 'Delete account').click()
      cy.get('[role="dialog"]').last().should('contain', "Can't delete account")
      cy.get('[role="dialog"]').last().should('contain', 'enrolled in a class')
      cy.get('[role="dialog"]').last().contains('button', 'Close').click()
      cy.get('[role="dialog"]').should('not.exist')

      cy.task('getFirestoreUserId', email).should('eq', uid)
    })
  })
})
