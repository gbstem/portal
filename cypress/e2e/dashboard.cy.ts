describe('Section C: Student/Parent Dashboard Actions', () => {
  it('Test Case 11: Create or View A Student Account Navigation', () => {
    cy.signedInSession('student')

    // Click "Create or View A Student Account"
    cy.contains('Create or View A Student Account').click()
    cy.url().should('include', '/apply')
    cy.get('h1').should('contain', 'Student Account Creation')
  })

  it('Test Case 12: Student Schedule & Join Class Zoom Link', () => {
    cy.signedInSession('student')

    // Verify Student Schedule and Next Upcoming Class card exists
    cy.get('body').should('contain', 'Student Schedule')
    cy.get('body').should('contain', 'Next Upcoming Class For')

    // Verify Join Class link points to a meeting link
    cy.contains('a', 'Join Class')
      .should('have.attr', 'target', '_blank')
      .should('have.attr', 'href')
      .and('include', 'http')
  })

  it('Test Case 13: Submit Weekly Class Feedback', () => {
    cy.signedInSession('student')

    // Verify Weekly Class Feedback Form exists
    cy.get('body').should('contain', 'Weekly Class Feedback Form')

    // Select the first course radio button
    cy.get('input[type="radio"]').first().check({ force: true })

    // Fill date, rating, and feedback
    cy.fillInput('input[name="date"]', '2026-06-12')
    cy.fillInput('input[name="rating"]', '5')
    cy.fillInput(
      'input[name="feedback"]',
      'Excellent teaching and interactive session!',
    )

    // Submit
    cy.get('form').contains('button', 'Submit').click()

    // Assert successful submission toast
    cy.waitForNotification('Class Feedback saved!')
  })
})
