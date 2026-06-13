import { generateDateHash } from '../support/utils'

describe('Section C & E: Instructor Applications & Community Service', () => {
  it.only('Test Case 8: Instructor Application Submission', () => {
    const email = `${generateDateHash('inst')}@gbstem.org`
    cy.loadSignupPage()
    cy.selectOption(
      'input[name="role"]',
      'High school/college student applying to be an instructor',
    )
    cy.fillInput('input[name="firstName"]', 'Instructor')
    cy.fillInput('input[name="lastName"]', 'Test')
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', 'penguin')
    cy.fillInput('input[name="confirmPassword"]', 'penguin')
    cy.get('button[type="submit"]').click()

    // Handle email verification dialog
    cy.get('[role="dialog"]').contains('button', 'Go to dashboard').click()
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })

    cy.visit('/apply')
    cy.wait(2000) // Allow auto-save to start and complete
    cy.get('h1').should('contain', 'Apply')

    // Wait for the form loading/saving to finish
    cy.get('input[name="personal.phoneNumber"]').should('not.be.disabled')

    // Fill application form details
    cy.fillInput('input[name="personal.phoneNumber"]', '5559876543')
    cy.fillInput('input[name="personal.dateOfBirth"]', '2005-10-10')
    cy.selectOption('input[name="personal.gender"]', 'Female')
    cy.get('#app-race-White').check({ force: true })

    cy.fillInput('input[name="academic.school"]', 'Harvard University')
    cy.fillInput('input[name="academic.graduationYear"]', '2028')

    // Check at least one course checkbox
    cy.get('[id^="app-course-"]').first().check({ force: true })

    // Fill in preferences and availability
    cy.fillInput('input[name="program.preferences"]', 'Prefer CS courses')
    cy.fillInput('input[name="program.timeSlots"]', 'Weekends')
    cy.get('textarea[name="program.notAvailable"]').type('None')

    cy.selectOption('input[name="program.reason"]', 'School')

    // Fill essays
    cy.get('input[name="essay.taughtBefore"]').uncheck({ force: true })
    cy.get('textarea[name="essay.academicBackground"]').type(
      'Some programming experience',
    )
    cy.get('textarea[name="essay.teachingScenario"]').type(
      'Try interactive games',
    )
    cy.get('textarea[name="essay.why"]').type('Want to teach kids')

    // Check agreements
    cy.get('input[name="agreements.entireProgram"]').check({ force: true })
    cy.get('input[name="agreements.timeCommitment"]').check({ force: true })
    cy.get('input[name="agreements.submitting"]').check({ force: true })

    // Submit
    cy.contains('button', 'Submit').click()

    // Assert successful submission toast
    cy.waitForNotification('Your application has been submitted!')

    // Reload the page
    cy.visit('/apply')
    cy.wait(1500)

    // Verify submitted status is displayed
    cy.get('body').should('contain', 'Application submitted and in review!')

    // Verify read-only form has the submitted values
    cy.get('input[name="personal.phoneNumber"]')
      .should('be.disabled')
      .should('have.value', '5559876543')
    cy.get('input[name="personal.dateOfBirth"]')
      .should('be.disabled')
      .should('have.value', '2005-10-10')
    cy.get('input[name="academic.school"]')
      .should('be.disabled')
      .should('have.value', 'Harvard University')
    cy.get('input[name="academic.graduationYear"]')
      .should('be.disabled')
      .should('have.value', '2028')
    cy.get('input[name="program.preferences"]')
      .should('be.disabled')
      .should('have.value', 'Prefer CS courses')
    cy.get('input[name="program.timeSlots"]')
      .should('be.disabled')
      .should('have.value', 'Weekends')
    cy.get('textarea[name="essay.academicBackground"]')
      .should('be.disabled')
      .should('have.value', 'Some programming experience')
  })

  it('Test Case 11: Instructor Community Service Hours', () => {
    // Sign in as existing accepted instructor
    cy.signedInSession('instructor', { initialPage: '/community-service' })

    // Click confirm hours button and verify email notification toast
    cy.contains('button', 'Get Hours Confirmation Email')
      .should('not.be.disabled')
      .click()
    cy.waitForNotification('Email sent successfully!')
  })
})
