describe('Section D: Class Roster and Details View', () => {
  beforeEach(() => {
    cy.clearAllCookies()
    cy.clearAllLocalStorage()
    cy.clearAllSessionStorage()
  })

  it('Test Case 9: Student View Enrolled Classes', () => {
    // Log in as student
    cy.signedInSession('student')
    cy.visit('/classes')
    cy.wait(2000) // Allow Svelte/Firebase to fetch classes

    cy.title().should('eq', 'Classes Overview')

    // Verify enrolled class is visible (Python 1 is seeded for the demo student)
    cy.get('body').should('contain', 'Python 1')
    cy.get('body').should('contain', 'Demo Instructor')
    cy.get('body').should('contain', 'Join Meeting')
    cy.get('body').should('contain', 'Contact Instructor')
  })

  it('Test Case 10: Instructor View Taught Classes', () => {
    // Log in as instructor
    cy.signedInSession('instructor')
    cy.visit('/classes')
    cy.wait(2000) // Allow Svelte/Firebase to fetch classes

    cy.title().should('eq', 'Classes Overview')

    // Verify taught class is visible
    cy.get('body').should('contain', 'Python 1')

    // For instructor view: it displays the class card without "Add/Drop Class" button
    // and they can see meeting details
    cy.get('body').should('contain', 'Demo Instructor')
  })
})
