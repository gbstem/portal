import semesterDates from '../../src/lib/data/semesterDates.json'

describe('Section D: Class Roster and Details View', () => {
  beforeEach(() => {
    // Set system clock to 1 day after registrationsDue date so class enrollment and schedule are visible
    const regDue = new Date(semesterDates.registrationsDue)
    const postRegDueDate = new Date(regDue.getTime() + 24 * 60 * 60 * 1000)
    cy.clock(postRegDueDate.getTime(), ['Date'])
  })

  it('Test Case 9: Student View Enrolled Classes, Filtering, and Toggle', () => {
    // Log in as student
    cy.signedInSession('student', { initialPage: '/classes' })

    // Verify enrolled class is visible (Python 1 is seeded for the demo student)
    cy.get('body').should('contain', 'Python 1')
    cy.get('body').should('contain', 'Demo Instructor')

    // 1. Select course filter
    cy.selectOption('input[placeholder="Filter by course"]', 'Python 1')
    cy.get('body').should('contain', 'Python 1')
    // We should not see other courses if we filter by Python 1
    cy.contains('body', 'Scratch 1').should('not.exist')

    // Remove filter
    cy.selectOption('input[placeholder="Filter by course"]', 'all')
    cy.get('body').should('contain', 'Python 1')
    cy.get('body').should('contain', 'Mathematics 2a')

    // 2. Toggle showing only enrolled classes
    cy.contains('button', 'Show all enrolled classes').click()
    cy.contains('button', 'Show all classes').should('be.visible')
    // Python 1 (enrolled class) should still be visible
    cy.get('body').should('contain', 'Python 1')
    // Mathematics 2a (not enrolled) should be removed
    cy.contains('body', 'Mathematics 2a').should('not.exist')

    // Toggle back to show all classes
    cy.contains('button', 'Show all classes').click()
    cy.contains('button', 'Show all enrolled classes').should('be.visible')
    // Both Python 1 and Mathematics 2a should reappear
    cy.get('body').should('contain', 'Python 1')
    cy.get('body').should('contain', 'Mathematics 2a')
  })

  it('Test Case 9b: Student Enroll in a Class', () => {
    // Log in as student
    cy.signedInSession('student', { initialPage: '/classes' })

    // Wait for class details and student enrollment data to load
    cy.get('body').should('contain', 'Mathematics 2a')
    // Empirically needed: removing this caused the enroll flow below to
    // silently produce no success toast in a real test run, even though the
    // card's text (and presumably its buttons) were already present -- some
    // settle time beyond "the card text exists" is required here.
    cy.wait(500)

    // Enroll in a class and verify enrollment confirmation email (/api/enroll)
    cy.contains('h2', 'Mathematics 2a')
      .closest('.group')
      .contains('button', 'Add/Drop Class')
      .click()
    cy.get('[role="dialog"]').should('exist')
    cy.get('[role="dialog"]')
      .contains('button', 'Enroll Student')
      .click({ force: true })
    cy.waitForNotification('Thank you for enrolling!')
    cy.get('[role="dialog"]').contains('button', 'Close').click({ force: true })
    cy.get('[role="dialog"]').should('not.exist')
    cy.verifyEmailSent(
      'student@gbstem.org',
      'Mathematics 2a class details for Demo Student One',
    )
  })

  it('Test Case 10: Instructor View Taught Classes', () => {
    // Log in as instructor
    cy.signedInSession('instructor', { initialPage: '/classes' })

    // Verify taught class is visible
    cy.get('body').should('contain', 'Python 1')

    // For instructor view: it displays the class card without "Add/Drop Class" button
    // and they can see meeting details
    cy.get('body').should('contain', 'Demo Instructor')

    // 1. Select course filter
    cy.selectOption('input[placeholder="Filter by course"]', 'Python 1')
    cy.get('body').should('contain', 'Python 1')
    cy.contains('body', 'Scratch 1').should('not.exist')

    // Remove filter
    cy.selectOption('input[placeholder="Filter by course"]', 'all')
    cy.get('body').should('contain', 'Python 1')
    cy.get('body').should('contain', 'Scratch 1')
  })

  it('Test Case 10b: Instructor Send Class Reminder to Students', () => {
    // Log in as instructor
    cy.signedInSession('instructor', { initialPage: '/dashboard' })

    // Verify instructor class schedule is visible and wait for student list to populate
    cy.contains('Next Upcoming Class:').should('be.visible')
    cy.get('body').should('contain', 'Python 1')
    // Empirically needed: same as the enroll flow above -- removing this
    // caused the reminder flow below to silently produce no success toast.
    cy.wait(1000)

    // Send class reminder to students and verify email (/api/remindStudents)
    cy.on('window:confirm', () => true)
    cy.contains('button', 'Send Reminder').click({ force: true })
    cy.waitForNotification('Reminder emails were sent!')
    cy.verifyEmailSent('student@gbstem.org', 'gbSTEM Class Reminder')
  })
})
