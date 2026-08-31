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
    cy.waitForFormHydration()
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
    cy.waitForFormHydration()
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
    cy.waitForFormHydration()
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
    cy.waitForFormHydration()
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
    cy.waitForFormHydration()

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

  // Portal and admin share one Firebase Auth instance, so an email that already
  // has an account anywhere - same role, the other portal role, or an admin-site
  // role - can never be signed up again here. `createUserWithEmailAndPassword`
  // rejects with `auth/email-already-in-use`, which `SignUpForm` hands to
  // `alert.trigger(..., true)`, so the failure surfaces as a red toast. That
  // toast is the whole point of these cases: without it the only thing the user
  // sees is a form that sat there, which is how the equivalent admin-site
  // failure was reported in production.
  ;[
    {
      label: 'Same Role (Existing Parent/Student)',
      email: 'student@gbstem.org',
      role: 'Parent registering my child for classes',
    },
    {
      label: 'Different Role, Same Site (Existing Instructor)',
      email: 'instructor@gbstem.org',
      role: 'Parent registering my child for classes',
    },
    {
      label: 'Different Role, Admin Site (Existing Reviewer)',
      email: 'reviewer@gbstem.org',
      role: 'High school/college student applying to be an instructor',
    },
    {
      label: 'Different Role, Admin Site (Existing Admin)',
      email: 'demo@gbstem.org',
      role: 'High school/college student applying to be an instructor',
    },
  ].forEach(({ label, email, role }) => {
    it(`Test Case 6: Sign Up Rejected for Existing Account - ${label}`, () => {
      cy.loadSignupPage()
      cy.selectOption('input[name="role"]', role, { timeout: 10000 })
      cy.fillInput('input[name="firstName"]', 'Duplicate')
      cy.fillInput('input[name="lastName"]', generateDateHash('Account'))
      cy.fillInput('input[name="email"]', email)
      cy.fillInput('input[name="password"]', 'penguin')
      cy.fillInput('input[name="confirmPassword"]', 'penguin')
      cy.get('button[type="submit"]').click()

      // The failure has to be visible, not just implied by a form that didn't
      // go anywhere.
      cy.waitForNotification('Email already in use.', 'bg-red-200')

      // Still on the signup form, and not signed in as anyone - least of all as
      // the pre-existing account whose email was just typed in.
      cy.get('[role="dialog"]').should('not.exist')
      cy.url().should('include', '/signup')
      cy.get('h1').should('contain', 'Sign up')

      cy.visit('/dashboard')
      cy.url().should('include', '/signin')
    })
  })

  it('Test Case 6b: Repeated Failed Sign Up Still Shows the Error', () => {
    // Retrying without a reload is what a real user does after a typo, and it
    // is where the equivalent admin-site flow regressed in production. Two
    // separate failures live here, so both get pinned:
    //
    // 1. Superforms' SPA `resetForm` default wiped every field - role included
    //    - on a rejected signup, leaving a blank form once the 3s toast
    //    expired.
    // 2. The toast has to re-raise on a second failure, not just the first.
    const email = 'instructor@gbstem.org'

    cy.loadSignupPage()
    cy.selectOption(
      'input[name="role"]',
      'Parent registering my child for classes',
      { timeout: 10000 },
    )
    cy.fillInput('input[name="firstName"]', 'Duplicate')
    cy.fillInput('input[name="lastName"]', generateDateHash('Retry'))
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', 'penguin')
    cy.fillInput('input[name="confirmPassword"]', 'penguin')
    cy.get('button[type="submit"]').click()

    cy.waitForNotification('Email already in use.', 'bg-red-200')

    // Let the submit cycle fully settle before reading the form back - the
    // reset used to land after the toast appeared, not with it.
    cy.get('fieldset').should('not.be.disabled')
    cy.get('input[name="role"]').should(
      'have.value',
      'Parent registering my child for classes',
    )
    cy.get('input[name="email"]').should('have.value', email)
    cy.get('input[name="firstName"]').should('have.value', 'Duplicate')
    cy.get('input[name="password"]').should('have.value', 'penguin')

    // Dismiss the toast (the whole banner is the dismiss button) and submit the
    // retained values again - the failure has to surface a second time.
    cy.get('.bg-red-200').click({ force: true })
    cy.get('.bg-red-200').should('not.exist')

    cy.get('button[type="submit"]').click()
    cy.waitForNotification('Email already in use.', 'bg-red-200')
  })
})
