describe('Section D: Class Roster and Details View', () => {
  beforeEach(() => {
    cy.clearAllCookies()
    cy.clearAllLocalStorage()
    cy.clearAllSessionStorage()
  })

  it('Test Case 9: Student View Enrolled Classes, Filtering, and Toggle', () => {
    // Log in as student
    cy.signedInSession('student')
    cy.visit('/classes')
    cy.wait(2000) // Allow Svelte/Firebase to fetch classes

    cy.title().should('eq', 'Classes Overview')

    // Verify enrolled class is visible (Python 1 is seeded for the demo student)
    cy.get('body').should('contain', 'Python 1')
    cy.get('body').should('contain', 'Demo Instructor')

    // 1. Select course filter
    cy.selectOption('input[placeholder="Filter by course"]', 'Python 1')
    cy.wait(500)
    cy.get('body').should('contain', 'Python 1')
    // We should not see other courses if we filter by Python 1
    cy.contains('body', 'Scratch 1').should('not.exist')

    // Remove filter
    cy.contains('button', 'Remove Filter').click()
    cy.wait(500)
    cy.get('body').should('contain', 'Python 1')
    cy.get('body').should('contain', 'Mathematics 2a')

    // 2. Toggle showing only enrolled classes
    cy.contains('button', 'Show all enrolled classes').click()
    cy.wait(500)
    cy.contains('button', 'Show all classes').should('be.visible')
    // Python 1 (enrolled class) should still be visible
    cy.get('body').should('contain', 'Python 1')
    // Mathematics 2a (not enrolled) should be removed
    cy.contains('body', 'Mathematics 2a').should('not.exist')

    // Toggle back to show all classes
    cy.contains('button', 'Show all classes').click()
    cy.wait(500)
    cy.contains('button', 'Show all enrolled classes').should('be.visible')
    // Both Python 1 and Mathematics 2a should reappear
    cy.get('body').should('contain', 'Python 1')
    cy.get('body').should('contain', 'Mathematics 2a')
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

    // 1. Select course filter
    cy.selectOption('input[placeholder="Filter by course"]', 'Python 1')
    cy.wait(500)
    cy.get('body').should('contain', 'Python 1')
    cy.contains('body', 'Scratch 1').should('not.exist')

    // Remove filter
    cy.contains('button', 'Remove Filter').click()
    cy.wait(500)
    cy.get('body').should('contain', 'Python 1')
    cy.get('body').should('contain', 'Scratch 1')
  })
})
