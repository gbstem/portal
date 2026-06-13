import { generateDateHash } from '../support/utils'

describe('Section C & E: Instructor Applications & Community Service', () => {
  it('Test Case 8: Instructor Application Submission', () => {
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
    cy.get('[role="dialog"]', { timeout: 10000 })
      .contains('button', 'Go to dashboard')
      .click()
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

  it('Test Case 8b: Instructor Application Status - Accepted', () => {
    cy.signedInSession('instructor')

    cy.get('body').should('contain', 'Your Classes')
    cy.get('a').contains('Community Service Hours Tracker').should('be.visible')

    cy.visit('/apply')
    cy.wait(1500)
    cy.get('body').should('contain', 'Application submitted and in review!')
    cy.get('input[name="personal.phoneNumber"]').should('be.disabled')
  })

  // TODO(dmeyer246) Figure out why enabling this causes the rest of the tests to fail,
  // due to polluted sessions.
  it.skip('Test Case 8c: Instructor Application Status - Rejected', () => {
    cy.signedInSession('instructor', {
      email: 'instructor-rejected@gbstem.org',
    })

    cy.get('body').contains(
      /we were not able to accept you as an instructor for gbSTEM/,
    )
    cy.get('a').contains('Community Service Hours Tracker').should('not.exist')

    cy.visit('/apply')
    cy.wait(1500)
    cy.get('body').should('contain', 'Application submitted and in review!')
    cy.signOutViaUi()
  })

  // TODO(dmeyer246) Figure out why enabling this causes the rest of the tests to fail,
  // due to polluted sessions.
  it.skip('Test Case 8d: Instructor Interview Slot Booking & Time Request', () => {
    cy.signedInSession('instructor', {
      email: 'instructor-interview@gbstem.org',
    })

    cy.get('body').should('contain', 'Available Interview Slots')

    // Scenario 1: Request time
    cy.contains('button', 'Request A Time').click()
    cy.fillInput('input[name="dateToAdd"]', '2026-06-15T15:00')
    cy.get('input[name="dateToAdd"]')
      .closest('form')
      .contains('button', 'Submit')
      .click()
    cy.waitForNotification('Thank you for requesting a new timeslot!')

    // Scenario 2: Book slot
    cy.visit('/dashboard')
    cy.wait(1500)
    cy.get('input[type="radio"]')
      .first()
      .parent()
      .invoke('text')
      .then((labelText) => {
        const expectedDate = labelText.split(' (')[0].trim()

        cy.get('input[type="radio"]').first().check({ force: true })
        cy.get('input[type="radio"]')
          .closest('form')
          .contains('button', 'Submit')
          .click()
        cy.waitForNotification('Thank you for signing up for an interview!')

        cy.get('body')
          .contains(/Your interview will be on/)
          .invoke('text')
          .then((text) => {
            const match = text.match(/Your interview will be on (.*?) with/)
            const capturedDate = match ? match[1].trim() : ''
            expect(capturedDate).to.equal(expectedDate)
          })
      })
    cy.signOutViaUi()
  })

  it('Test Case 10b: Instructor Submit Attendance Feedback', () => {
    cy.signedInSession('instructor')

    cy.contains('button', 'Submit Feedback').click()
    cy.get('[role="dialog"]').within(() => {
      cy.contains(/class feedback form/i).should('be.visible')
      cy.get('input[name="classDate"]').should('not.be.disabled')
      cy.fillInput('input[name="classDate"]', '2026-06-12')
      cy.fillInput('input[name="classNumber"]', '1')
      cy.fillInput(
        'input[name="feedback"]',
        'Class went really well! Students were highly interactive.',
      )
      cy.get('input[type="checkbox"]').first().check({ force: true }) // Check attendance for first student
      cy.contains('button', 'Submit').click({ force: true })
    })
    cy.waitForNotification('Class Feedback saved!')
  })

  it('Test Case 11: Instructor Community Service Hours', () => {
    cy.signedInSession('instructor', { initialPage: '/community-service' })

    // Click confirm hours button and verify email notification toast
    cy.contains('button', 'Get Hours Confirmation Email')
      .should('not.be.disabled')
      .click()
    cy.waitForNotification('Email sent successfully!')
  })

  it('Test Case 13: Class Details Submission & Modifying Details', () => {
    cy.signedInSession('instructor')

    // Edit Form Details
    cy.contains('h2', 'Class Details')
      .closest('.rounded-xl')
      .within(() => {
        cy.contains('button', 'Edit class details').click()
        cy.fillInput('input[name="classCap"]', '8')
        cy.get('button[type="submit"]').click()
      })
    cy.waitForNotification('Class details saved!')

    // Wait for the 2-second timeout reload to trigger and load the page
    cy.wait(2500)
    cy.contains('h2', 'Class Details')
      .closest('.rounded-xl')
      .within(() => {
        cy.get('input[name="classCap"]')
          .should('be.disabled')
          .should('have.value', '8')
      })
  })

  it('Test Case 14: Edit Schedule and Add Class', () => {
    cy.signedInSession('instructor')

    // Edit Schedule & Delete Class Session
    cy.contains('button', 'Edit Schedule').click()
    cy.get('input[type="datetime-local"]').first().should('be.visible')
    cy.contains('button', 'Delete').first().click()
    cy.contains('button', 'Save Changes').click()

    // Handle notify parents modal
    cy.get('[role="dialog"]').should('contain', "notify your student's parents")
    cy.contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')

    // Add Class Session
    cy.contains('button', 'Add Class to Schedule').click()
    cy.get('[role="dialog"]').within(() => {
      cy.fillInput('input[type="datetime-local"]', '2026-06-20T11:00')
      cy.contains('button', 'Add Class').click({ force: true })
    })
    cy.waitForNotification('Meeting times updated!')

    // Close the warning dialog to notify parents.
    cy.get('[role="dialog"]').should('contain', "notify your student's parents")
    cy.contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')

    // Verify it worked
    cy.get('body').should('contain', 'June 20')
  })

  it('Test Case 15: Request Sub', () => {
    cy.signedInSession('instructor')

    // Request Sub
    cy.contains('button', 'Request Sub').first().click()
    cy.get('[role="dialog"]').should('contain', 'Submit A Sub Request')
    cy.get('[role="dialog"]')
      .find('input[type="text"]')
      .type('Sub to cover lists and loops')
    cy.contains('button', 'Confirm Request').click({ force: true })
    cy.waitForNotification('Sub request sent!')
  })
})
