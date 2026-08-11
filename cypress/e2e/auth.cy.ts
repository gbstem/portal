import { generateDateHash } from '../support/utils'

describe('Section A: Authentication and Navigation', () => {
  it('Test Case 1: Unauthenticated Redirect to Sign In', () => {
    // Attempting to visit protected routes should redirect to signin
    cy.visit('/')
    cy.url().should('include', '/signin')
    cy.get('h1').should('contain', 'Sign in')

    cy.visit('/dashboard')
    cy.url().should('include', '/signin')
    cy.get('h1').should('contain', 'Sign in')

    cy.visit('/profile')
    cy.url().should('include', '/signin')
    cy.get('h1').should('contain', 'Sign in')
  })

  it('Test Case 2: Unsuccessful Sign In', () => {
    cy.visit('/signin')
    cy.get('input[type="email"]').should('be.visible')
    cy.wait(500) // Let Svelte finish page load
    cy.fillInput('input[type="email"]', 'instructor@gbstem.org')
    cy.fillInput('input[type="password"]', 'wrongpassword')
    cy.get('button[type="submit"]').click()

    // Assert that we stay on signin and an alert error is visible
    cy.url().should('include', '/signin')
    cy.waitForNotification('Wrong password.', 'bg-red-200')
  })

  it('Test Case 2b: Unsuccessful Sign In as Admin', () => {
    cy.visit('/signin')
    cy.get('input[type="email"]').should('be.visible')
    cy.wait(500)
    cy.fillInput('input[type="email"]', 'demo@gbstem.org')
    cy.fillInput('input[type="password"]', 'penguin')
    cy.get('button[type="submit"]').click()

    // Assert that we stay on signin and an alert error is visible
    cy.url().should('include', '/signin')
    cy.waitForNotification(
      'Admins must sign in on the admin site.',
      'bg-red-200',
    )
  })

  it('Test Case 3a: Successful Sign In as Instructor', () => {
    cy.visit('/')
    cy.url().should('include', '/signin')
    cy.get('input[type="email"]').should('be.visible')
    cy.wait(500) // Wait for the double redirect and auth listener to settle
    cy.fillInput('input[type="email"]', 'instructor@gbstem.org')
    cy.fillInput('input[type="password"]', 'penguin')
    cy.get('button[type="submit"]').click()

    cy.url().should('include', '/dashboard')
    cy.get('h1').should('contain', 'Dashboard')

    // Verify authorized navigation components are visible
    cy.contains('a', 'Dashboard').should('be.visible')
    cy.contains('a', 'Apply').should('be.visible')
    cy.contains('a', 'Classes').should('be.visible')
    cy.contains('a', 'Community Service Hours Tracker').should('be.visible')
    cy.get('button[aria-label="Profile menu"]').should('be.visible')

    // Verify student components are not visible
    cy.contains('a', 'Register').should('not.exist')
  })

  it('Test Case 3b: Successful Sign In as Student', () => {
    cy.visit('/')
    cy.url().should('include', '/signin')
    cy.get('input[type="email"]').should('be.visible')
    cy.wait(500) // Wait for the double redirect and auth listener to settle
    cy.fillInput('input[type="email"]', 'student@gbstem.org')
    cy.fillInput('input[type="password"]', 'penguin')
    cy.get('button[type="submit"]').click()

    cy.url().should('include', '/dashboard')
    cy.get('h1').should('contain', 'Dashboard')

    // Verify authorized navigation components are visible
    cy.contains('a', 'Dashboard').should('be.visible')
    cy.contains('a', 'Register').should('be.visible')
    cy.contains('a', 'Classes').should('be.visible')
    cy.get('button[aria-label="Profile menu"]').should('be.visible')

    // Verify student components are not visible
    cy.contains('a', 'Apply').should('not.exist')
    cy.contains('a', 'Community Service Hours Tracker').should('not.exist')
  })

  it('Test Case 4: Password Reset Form', () => {
    cy.visit('/signin')
    cy.contains('a', 'Forgot password?').click()
    cy.url().should('include', '/reset-password')
    cy.get('input[type="email"]').should('be.visible')
    cy.wait(500) // Wait for Svelte transition to settle

    cy.fillInput('input[type="email"]', 'instructor@gbstem.org')
    cy.get('button[type="submit"]').click()

    // Verify reset notification toast shows up
    cy.get('body').should('contain', 'Password reset email was sent')
    cy.get('input[type="email"]').should('have.value', '')
  })

  ;[
    { resend: false, label: 'Original Email' },
    { resend: true, label: 'Resent Email' },
  ].forEach(({ resend, label }) => {
    it(`Test Case 5a: Direct Sign Up as Student/Parent (${label})`, () => {
      const first = 'Charlie'
      const last = generateDateHash(`Brown-${resend ? 'resend' : 'orig'}`)
      const email = `${generateDateHash(`charlie.brown.${resend ? 'resend' : 'orig'}`)}@gmail.com`

      cy.loadSignupPage()
      cy.selectOption(
        'input[name="role"]',
        'Parent registering my child for classes',
        { timeout: 10000 },
      )
      cy.fillInput('input[name="firstName"]', first)
      cy.fillInput('input[name="lastName"]', last)
      cy.fillInput('input[name="email"]', email)
      cy.fillInput('input[name="password"]', 'penguin')
      cy.fillInput('input[name="confirmPassword"]', 'penguin')
      cy.get('button[type="submit"]').click()

      // Expect a dialog to pop up asking the user to verify their email
      cy.get('[role="dialog"]').should('exist')
      cy.contains('Please verify your email').should('be.visible')

      // Click Close (which sends them to profile because email is unverified)
      cy.get('[role="dialog"]').contains('button', 'Close').click()
      cy.get('[role="dialog"]', { timeout: 10000 }).should('not.exist')
      cy.url().should('include', '/profile')
      cy.contains('a', 'Dashboard').should('not.exist')
      cy.contains('a', 'Register').should('not.exist')
      cy.contains('a', 'Classes').should('not.exist')

      if (resend) {
        // Verify original OOB link exists but don't click it
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').should('exist')
        // Clear out the original verification email
        cy.clearTestEmails()
        // Click "Send it again" to get a second OOB link
        cy.contains('button', 'Send it again.').click()
        cy.waitForNotification('Verification email was sent.', 'bg-gray-200')
        // Verify using the new OOB link
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
          cy.request(link)
        })
      } else {
        // Verify email (emulated email side-channel using original link)
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
          cy.request(link)
        })
      }

      // Revisit profile page and confirm email verification guard is bypassed
      cy.visit('/profile')
      cy.get('[role="dialog"]').should('not.exist')
      cy.contains('Role: parent').should('be.visible')

      // Verify student navigation links are now visible
      cy.contains('a', 'Dashboard').should('be.visible')
      cy.contains('a', 'Register').should('be.visible')
      cy.contains('a', 'Classes').should('be.visible')

      // Verify instructor navigation links are not visible
      cy.contains('a', 'Apply').should('not.exist')
    })
  })

  ;[
    { resend: false, label: 'Original Email' },
    { resend: true, label: 'Resent Email' },
  ].forEach(({ resend, label }) => {
    it(`Test Case 5b: Direct Sign Up as Instructor (${label})`, () => {
      const first = 'Jane'
      const last = generateDateHash(`Doe-${resend ? 'resend' : 'orig'}`)
      const email = `${generateDateHash(`jane.doe.${resend ? 'resend' : 'orig'}`)}@gmail.com`

      cy.loadSignupPage()
      cy.selectOption(
        'input[name="role"]',
        'High school/college student applying to be an instructor',
        { timeout: 10000 },
      )
      cy.fillInput('input[name="firstName"]', first)
      cy.fillInput('input[name="lastName"]', last)
      cy.fillInput('input[name="email"]', email)
      cy.fillInput('input[name="password"]', 'penguin')
      cy.fillInput('input[name="confirmPassword"]', 'penguin')
      cy.get('button[type="submit"]').click()

      // Expect a dialog to pop up asking the user to verify their email
      cy.get('[role="dialog"]').should('exist')
      cy.contains('Please verify your email').should('be.visible')

      // Click Close (which sends them to profile because email is unverified)
      cy.get('[role="dialog"]').contains('button', 'Close').click()
      cy.get('[role="dialog"]').should('not.exist')
      cy.url().should('include', '/profile')
      cy.contains('a', 'Dashboard').should('not.exist')
      cy.contains('a', 'Apply').should('not.exist')
      cy.contains('a', 'Classes').should('not.exist')

      if (resend) {
        // Verify original OOB link exists but don't click it
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').should('exist')
        // Clear out the original verification email
        cy.clearTestEmails()
        // Click "Send it again" to get a second OOB link
        cy.contains('button', 'Send it again.').click()
        cy.waitForNotification('Verification email was sent.', 'bg-gray-200')
        // Verify using the new OOB link
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
          cy.request(link)
        })
      } else {
        // Verify email (emulated email side-channel using original link)
        cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
          cy.request(link)
        })
      }

      // Revisit profile page and confirm email verification guard is bypassed
      cy.visit('/profile')
      cy.get('[role="dialog"]').should('not.exist')
      cy.contains('Role: instructor').should('be.visible')

      // Verify instructor navigation links are now visible
      cy.contains('a', 'Dashboard').should('be.visible')
      cy.contains('a', 'Apply').should('be.visible')
      cy.contains('a', 'Classes').should('be.visible')

      // Verify student navigation links are not visible
      cy.contains('a', 'Register').should('not.exist')
    })
  })
})
