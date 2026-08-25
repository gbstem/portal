import {
  currentSemester,
  studentFeedbackCollection,
} from '../../src/lib/data/collections'
import semesterDates from '../../src/lib/data/semesterDates.json'
import { prepareDocForCompare } from '../support/utils'

/** The class the admin seed enrols the demo student in. */
const SEEDED_CLASS_ID = 'class-python1'

describe('Section C: Student/Parent Dashboard Actions', () => {
  it('Test Case 11: Create or View A Student Account Navigation', () => {
    cy.signedInSession('student')

    // Click "Create or View A Student Account"
    cy.contains('Create or View A Student Account').click()
    cy.url().should('include', '/apply')
    cy.get('h1').should('contain', 'Student Account Creation')
  })

  it('Test Case 12: Student Schedule & Join Class Zoom Link', () => {
    // Set system date to 1 day after student orientation so student schedule is visible regardless of semester dates
    const orientationDate = new Date(semesterDates.studentOrientation)
    const postOrientationDate = new Date(
      orientationDate.getTime() + 24 * 60 * 60 * 1000,
    )
    cy.clock(postOrientationDate.getTime(), ['Date'])

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
    // Freeze Date so the `${classId}-${Date.now()}` document id this writes is
    // computable rather than needing a scan of the 30 seeded feedback docs.
    const submittedAt = new Date('2026-06-12T12:00:00Z')
    cy.clock(submittedAt.getTime(), ['Date'])

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

    // Four of the nine stored fields are derived rather than typed:
    // `instructor` and `course` come from matching the chosen `classId` against
    // the student's course list, and `studentName`/`studentId` from their
    // registration. A lookup miss writes empty strings with no error, which is
    // exactly what a toast-only assertion misses.
    cy.getFirebaseAuthToken().then((authToken: string) => {
      cy.getFirestoreDoc(
        authToken,
        studentFeedbackCollection,
        `${SEEDED_CLASS_ID}-${submittedAt.getTime()}`,
      ).then((data: any) => {
        expect(data, 'student feedback document').to.not.equal(null)
        expect(prepareDocForCompare(data)).to.deep.equal({
          semester: currentSemester,
          studentId: 'student-demo-uid-1',
          studentName: 'Demo Student One',
          classId: SEEDED_CLASS_ID,
          course: 'Python 1',
          instructor: 'Demo Instructor',
          date: '2026-06-12',
          rating: 5,
          feedback: 'Excellent teaching and interactive session!',
        })
      })
    })
  })
})
