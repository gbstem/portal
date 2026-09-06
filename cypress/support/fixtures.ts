import { classesCollection } from '../../src/lib/data/collections'
import semesterDates from '../../src/lib/data/semesterDates.json'

/**
 * The seeded accounts and documents the instructor specs are written against,
 * plus the few helpers that read or drive them.
 *
 * Shared rather than duplicated because two specs now cover overlapping parts
 * of the same data: instructor.cy.ts (a class and its co-instructors) and
 * substitute.cy.ts (the sub request lifecycle). Everything here matches
 * admin's `scripts/seedLib.ts`; when a fixture changes there it changes here,
 * in one place.
 */

/** The class the seed gives instructor@gbstem.org. */
export const SEEDED_CLASS_ID = 'class-python1'
export const SEEDED_MEETING_LINK = 'https://zoom.us/j/123456789'
export const SEEDED_STUDENTS = ['student-demo-uid-1', 'student1', 'student2']
/** The only one of `SEEDED_STUDENTS` with a registration document. */
export const SEEDED_STUDENT_NAME = 'Demo Student One'
export const SEEDED_STUDENT_EMAIL = 'student@gbstem.org'

/** The class's own instructor. */
export const OWNER_UID = 'instructor-demo-uid'
export const OWNER_EMAIL = 'instructor@gbstem.org'
/** Accepted, teaching no class of their own: the co-instructor fixture. */
export const COHOST_UID = 'instructor-cohost-uid'
export const COHOST_EMAIL = 'cohost@gbstem.org'
/** Accepted as a substitute rather than to teach - a different dashboard. */
export const SUBSTITUTE_UID = 'instructor-substitute-uid'
export const SUBSTITUTE_EMAIL = 'substitute@gbstem.org'

/**
 * Not semester-scoped, unlike every other collection here: it's the uid-keyed
 * index of which classes to show an instructor on their dashboard. See
 * classService's fetchInstructorClasses.
 */
export const INSTRUCTOR_CLASSES_COLLECTION = 'instructorClasses'

/** Reads the seeded class document straight out of Firestore. */
export function readClassDoc(): Cypress.Chainable<any> {
  return cy
    .getFirebaseAuthToken()
    .then((authToken: string) =>
      cy.getFirestoreDoc(authToken, classesCollection, SEEDED_CLASS_ID),
    )
}

/** Asserts whether a document exists, straight through the Admin SDK. */
export function expectDocExists(
  docPath: string,
  exists: boolean,
  label: string,
) {
  cy.task('checkFirestoreDocExists', docPath).then((found) => {
    expect(found, label).to.equal(exists)
  })
}

/**
 * Moves the clock past instructor orientation, which is what makes
 * `ClassSchedule` - and so the "Request Sub" buttons - render at all. Has to
 * happen before the visit, or the page has already decided not to render it.
 */
export function afterOrientation(dayOffset = 1): Date {
  const frozenNow = new Date(
    new Date(semesterDates.instructorOrientation).getTime() +
      dayOffset * 24 * 60 * 60 * 1000,
  )
  cy.clock(frozenNow.getTime(), ['Date'])
  return frozenNow
}

/**
 * Files a sub request from the signed-in instructor's dashboard and yields its
 * class number, which is what names the document
 * (`${classId}---${classNumber}`).
 *
 * `sessionIndex` picks which scheduled session to ask for cover for; a second
 * request has to name a different one, since two requests for the same session
 * are the same document.
 */
export function fileSubRequest(
  notes: string,
  sessionIndex = 0,
): Cypress.Chainable<number> {
  // `cy.contains` yields one element, so it cannot be indexed into - the
  // second session's button has to be selected from the whole set.
  cy.get('button:contains("Request Sub")').eq(sessionIndex).click()
  cy.get('[role="dialog"]').should('contain', 'Submit A Sub Request')
  cy.get('[role="dialog"]').find('input[type="text"]').clear().type(notes)
  return cy
    .get('[role="dialog"]')
    .find('input[type="number"]')
    .invoke('val')
    .then((raw) => {
      const classNumber = Number(raw)
      cy.contains('button', 'Confirm Request').click({ force: true })
      cy.waitForNotification('Sub request sent!')
      // `sendSubRequest` calls location.reload() 1000ms later, and "Your Sub
      // Requests" only lists the new request once that reload has refetched.
      // The wait is pinned to that literal timer, not guesswork.
      cy.wait(2000)
      cy.contains('h2', 'Your Sub Requests', { timeout: 10000 }).should(
        'be.visible',
      )
      return cy.wrap(classNumber)
    })
}

/** One row of the "Your Sub Requests" card, by the session it covers. */
export function subRequestRow(classNumber: number) {
  return cy
    .contains('h2', 'Your Sub Requests')
    .parent()
    .contains('div', `class #${classNumber}`, { timeout: 10000 })
}
