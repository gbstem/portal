import { generateDateHash } from '../support/utils'

describe('Section A: Authentication and Navigation', () => {
  beforeEach(() => {
    // Clear cookies/localStorage to ensure we start unauthenticated
    cy.clearAllCookies()
    cy.clearAllLocalStorage()
    cy.clearAllSessionStorage()
  })

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
    cy.get('.bg-red-200').should('be.visible')
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

  it('Test Case 5a: Direct Sign Up as Student/Parent', () => {
    cy.visit('/signup')
    cy.get('h1').should('contain', 'Sign up')
    cy.get('input[name="firstName"]').should('be.visible')
    cy.wait(1000) // Wait for signup initialization

    const first = 'Charlie'
    const last = generateDateHash('Brown')
    const email = `${generateDateHash('charlie.brown')}@gmail.com`

    cy.selectOption(
      'input[name="role"]',
      'Parent registering my child for classes',
    )
    cy.fillInput('input[name="firstName"]', first)
    cy.fillInput('input[name="lastName"]', last)
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', 'penguin')
    cy.fillInput('input[name="confirmPassword"]', 'penguin')
    cy.get('button[type="submit"]').click()

    // Expect a "please verify your email" dialog with a "Go to dashboard" link
    cy.get('[role="dialog"]').should('exist')

    // Click Go to dashboard (which sends them to profile because email is unverified)
    cy.get('[role="dialog"]').contains('button', 'Go to dashboard').click()
    cy.url().should('include', '/profile')
    cy.contains('a', 'Dashboard').should('not.exist')
    cy.contains('a', 'Register').should('not.exist')
    cy.contains('a', 'Classes').should('not.exist')

    // Simulate email verification via emulator oob link
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    // Revisit profile page and confirm email verification guard is bypassed
    cy.visit('/profile')
    cy.get('[role="dialog"]').should('not.exist')

    // Verify student navigation links are now visible
    cy.contains('a', 'Dashboard').should('be.visible')
    cy.contains('a', 'Register').should('be.visible')
    cy.contains('a', 'Classes').should('be.visible')

    // Verify instructor navigation links are not visible
    cy.contains('a', 'Apply').should('not.exist')
  })

  it('Test Case 5b: Direct Sign Up as Instructor', () => {
    cy.visit('/signup')
    cy.get('h1').should('contain', 'Sign up')
    cy.get('input[name="firstName"]').should('be.visible')
    cy.wait(500) // Wait for signup initialization

    const first = 'Jane'
    const last = generateDateHash('Doe')
    const email = `${generateDateHash('jane.doe')}@gmail.com`

    cy.selectOption(
      'input[name="role"]',
      'High school/college student applying to be an instructor',
    )
    cy.fillInput('input[name="firstName"]', first)
    cy.fillInput('input[name="lastName"]', last)
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', 'penguin')
    cy.fillInput('input[name="confirmPassword"]', 'penguin')
    cy.get('button[type="submit"]').click()

    // Expect a "please verify your email" dialog with a "Go to dashboard" link
    cy.get('[role="dialog"]').should('exist')

    // Click Go to dashboard (which sends them to profile because email is unverified)
    cy.get('[role="dialog"]').contains('button', 'Go to dashboard').click()
    cy.url().should('include', '/profile')
    cy.contains('a', 'Dashboard').should('not.exist')
    cy.contains('a', 'Apply').should('not.exist')
    cy.contains('a', 'Classes').should('not.exist')

    // Simulate email verification via emulator oob link
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    // Revisit profile page and confirm email verification guard is bypassed
    cy.visit('/profile')
    cy.get('[role="dialog"]').should('not.exist')

    // Verify instructor navigation links are now visible
    cy.contains('a', 'Dashboard').should('be.visible')
    cy.contains('a', 'Apply').should('be.visible')
    cy.contains('a', 'Classes').should('be.visible')

    // Verify student navigation links are not visible
    cy.contains('a', 'Register').should('not.exist')
  })
})
