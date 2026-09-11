import {
  classesCollection,
  registrationsCollection,
} from '../../src/lib/data/collections'
import semesterDates from '../../src/lib/data/semesterDates.json'
import {
  SCRATCH_CLASS_CAP,
  SCRATCH_CLASS_ID,
  SCRATCH_INSTRUCTOR_NAME,
  SCRATCH_STUDENTS,
  SEEDED_CLASS_ID,
  SEEDED_STUDENT_EMAIL,
  SEEDED_STUDENT_NAME,
  SEEDED_STUDENT_UID,
  SEEDED_STUDENTS,
} from '../support/fixtures'

const REGISTRATION_PATH = `${registrationsCollection}/${SEEDED_STUDENT_UID}`
const classPath = (classId: string) => `${classesCollection}/${classId}`

/**
 * Puts the demo student's enrollment back to the seed's - in Python 1 alone,
 * on both the class roster and the registration - and Scratch 1 back to its
 * seeded roster and cap.
 *
 * The enrollment tests below enroll and unenroll the same student, and the
 * spec shares one seeded emulator, so without this each test would start from
 * whatever the last one left - and a retried test from what its own first
 * attempt left. The Mathematics 2a class Test Case 9b adds the student to is
 * not reset, and needn't be: a retry finds the student on that roster but not
 * on the registration, which the enrollment completes rather than refuses.
 */
function restoreSeededEnrollment() {
  cy.task('mergeFirestoreDoc', {
    docPath: classPath(SEEDED_CLASS_ID),
    data: { students: SEEDED_STUDENTS },
  })
  cy.task('mergeFirestoreDoc', {
    docPath: classPath(SCRATCH_CLASS_ID),
    data: { students: SCRATCH_STUDENTS, classCap: SCRATCH_CLASS_CAP },
  })
  cy.task('mergeFirestoreDoc', {
    docPath: REGISTRATION_PATH,
    data: { classes: [SEEDED_CLASS_ID], enrolled: true },
  })
}

/**
 * Signs the demo parent in on /classes and waits for the page to be usable.
 */
function visitClassesAsParent() {
  cy.signedInSession('student', { initialPage: '/classes' })
  // Wait for class details and student enrollment data to load
  cy.get('body').should('contain', 'Mathematics 2a')
  // Empirically needed: removing this caused the enroll flow to silently
  // produce no success toast in a real test run, even though the card's text
  // (and presumably its buttons) were already present -- some settle time
  // beyond "the card text exists" is required here.
  cy.wait(500)
}

/** Opens the Add/Drop dialog on the first class card containing `text`. */
function openAddDrop(text: string) {
  cy.contains('.group', text).contains('button', 'Add/Drop Class').click()
  cy.get('[role="dialog"]').should('exist')
}

/**
 * Asserts a refused enrollment in Scratch 1 wrote nothing: not to the class
 * roster, and not to the registration, which still lists `expectedClasses`.
 * The refusal is the server's, so this is checked in Firestore rather than
 * inferred from the toast.
 */
function expectScratchEnrollmentRefused(expectedClasses: string[]) {
  cy.task('readFirestoreDoc', classPath(SCRATCH_CLASS_ID)).then(
    (classDoc: any) => {
      expect(classDoc.students, 'class roster unchanged').to.deep.equal(
        SCRATCH_STUDENTS,
      )
    },
  )
  cy.task('readFirestoreDoc', REGISTRATION_PATH).then((registration: any) => {
    expect(registration.classes, 'registration unchanged').to.deep.equal(
      expectedClasses,
    )
  })
}

describe('Section D: Class Roster and Details View', () => {
  beforeEach(() => {
    // Set system clock to 1 day after registrationsDue date so class enrollment and schedule are visible
    const regDue = new Date(semesterDates.registrationsDue)
    const postRegDueDate = new Date(regDue.getTime() + 24 * 60 * 60 * 1000)
    cy.clock(postRegDueDate.getTime(), ['Date'])
    restoreSeededEnrollment()
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
    visitClassesAsParent()

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
    // The dialog closes once the enrollment has been written.
    cy.get('[role="dialog"]').should('not.exist')

    // Both halves of the enrollment, not just the toast and the email. The
    // class half is the one that went missing for as long as it was a client
    // write firestore.rules refuses to every parent - and the roster, the
    // spots remaining and every reminder read that half.
    cy.task('readFirestoreDoc', REGISTRATION_PATH).then((registration: any) => {
      expect(registration.enrolled, 'registration enrolled').to.equal(true)
      expect(registration.classes, 'seeded class kept').to.include(
        SEEDED_CLASS_ID,
      )
      expect(registration.classes, 'one class added').to.have.length(2)
      const enrolledClassId = registration.classes.find(
        (classId: string) => classId !== SEEDED_CLASS_ID,
      )

      cy.task('readFirestoreDoc', classPath(enrolledClassId)).then(
        (classDoc: any) => {
          expect(classDoc.course, 'enrolled class').to.equal('Mathematics 2a')
          expect(classDoc.students, 'on the class roster').to.include(
            SEEDED_STUDENT_UID,
          )
          // Generated classes carry an instructorUid no Auth account backs,
          // so the cc is the class's stored address.
          cy.verifyEmailSent(
            SEEDED_STUDENT_EMAIL,
            `Mathematics 2a class details for ${SEEDED_STUDENT_NAME}`,
            { to: [SEEDED_STUDENT_EMAIL], cc: [classDoc.instructorEmail] },
          )
        },
      )
    })
  })

  it('Test Case 9c: Student Unenroll from a Class', () => {
    visitClassesAsParent()

    // Python 1 is the one class the seed enrolls the demo student in.
    cy.contains('button', 'Show all enrolled classes').click()
    openAddDrop('Python 1')
    cy.get('[role="dialog"]')
      .contains('button', 'Unenroll Student')
      .click({ force: true })
    cy.waitForNotification('Unenrolled from class!')
    cy.get('[role="dialog"]').should('not.exist')

    cy.task('readFirestoreDoc', classPath(SEEDED_CLASS_ID)).then(
      (classDoc: any) => {
        expect(
          classDoc.students,
          'off the roster, classmates kept',
        ).to.deep.equal(
          SEEDED_STUDENTS.filter((uid) => uid !== SEEDED_STUDENT_UID),
        )
      },
    )
    cy.task('readFirestoreDoc', REGISTRATION_PATH).then((registration: any) => {
      expect(registration.classes, 'no classes left').to.deep.equal([])
      expect(registration.enrolled, 'registration unenrolled').to.equal(false)
    })
  })

  it('Test Case 9d: Student Cannot Enroll in a Full Class', () => {
    // Fill Scratch 1 to its cap, without the demo student.
    cy.task('mergeFirestoreDoc', {
      docPath: classPath(SCRATCH_CLASS_ID),
      data: { classCap: SCRATCH_STUDENTS.length },
    })
    visitClassesAsParent()

    openAddDrop(SCRATCH_INSTRUCTOR_NAME)
    cy.get('[role="dialog"]')
      .contains('button', 'Enroll Student')
      .click({ force: true })
    cy.waitForNotification('That class is full.', 'bg-red-200')

    expectScratchEnrollmentRefused([SEEDED_CLASS_ID])
  })

  it('Test Case 9e: Student Cannot Enroll in a Third Class', () => {
    // Two classes already: the seeded one and a generated Mathematics 2a.
    const twoClasses = [SEEDED_CLASS_ID, 'class-fake-4']
    cy.task('mergeFirestoreDoc', {
      docPath: REGISTRATION_PATH,
      data: { classes: twoClasses },
    })
    visitClassesAsParent()

    openAddDrop(SCRATCH_INSTRUCTOR_NAME)
    cy.get('[role="dialog"]')
      .contains('button', 'Enroll Student')
      .click({ force: true })
    cy.waitForNotification(
      'Each student may only enroll in a maximum of 2 classes.',
      'bg-red-200',
    )

    expectScratchEnrollmentRefused(twoClasses)
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
    cy.captureConfirms().as('confirms')
    cy.contains('button', 'Send Reminder').click({ force: true })
    cy.waitForNotification('Reminder emails were sent!')
    cy.get('@confirms').should('have.length', 1)
    // The all-students wording specifically: `sendClassReminder` has a
    // second, per-student prompt, and this button must not be taking it.
    cy.get('@confirms').its(0).should('contain', 'all students')
    cy.verifyEmailSent('student@gbstem.org', 'gbSTEM Class Reminder', {
      to: ['student@gbstem.org'],
      cc: [],
    })

    // Verify individual student reminder from the roster dialog
    cy.contains('button', 'View Student List').click()
    cy.get('[role="dialog"]').should('be.visible')
    cy.get('[role="dialog"]').within(() => {
      cy.contains('td', 'Demo Student One').should('be.visible')
      cy.contains('td', 'student@gbstem.org').should('be.visible')
      cy.contains('td', 'Demo Student One').parent('tr').find('button').click()
    })
    cy.waitForNotification('Reminder email was sent to Demo Student One!')
    cy.get('@confirms').should('have.length', 2)
    cy.get('@confirms')
      .its(1)
      .should('contain', 'Send class reminder to student Demo Student One?')
    cy.verifyEmailSent('student@gbstem.org', 'gbSTEM Class Reminder', {
      to: ['student@gbstem.org'],
      cc: [],
    })
  })
})
