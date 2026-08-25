import { coursesJson } from '../../src/lib/data'
import {
  applicationsCollection,
  classesCollection,
  currentSemester,
  instructorFeedbackCollection,
} from '../../src/lib/data/collections'
import semesterDates from '../../src/lib/data/semesterDates.json'
import { generateDateHash, prepareDocForCompare } from '../support/utils'

/** Every field the instructor application form renders. */
interface ApplicationInput {
  phoneNumber: string
  dateOfBirth: string
  gender: string
  race: string[]
  school: string
  graduationYear: number
  courses: string[]
  preferences: string
  timeSlots: string
  notAvailable: string
  programInPerson: boolean
  reason: string
  taughtBefore: boolean
  academicBackground: string
  teachingScenario: string
  why: string
  entireProgram: boolean
  timeCommitment: boolean
  submitting: boolean
}

// `bind:group` stores checkbox selections in tick order, which isn't meaningful.
const APPLICATION_ARRAY_FIELDS = ['personal.race', 'program.courses']

function signUpInstructor(): string {
  const email = `${generateDateHash('inst')}@gbstem.org`
  cy.loadSignupPage()
  cy.selectOption(
    'input[name="role"]',
    'High school/college student applying to be an instructor',
    { timeout: 10000 },
  )
  cy.fillInput('input[name="firstName"]', 'Instructor')
  cy.fillInput('input[name="lastName"]', 'Test')
  cy.fillInput('input[name="email"]', email)
  cy.fillInput('input[name="password"]', 'penguin')
  cy.fillInput('input[name="confirmPassword"]', 'penguin')
  cy.get('button[type="submit"]').click()

  // Handle email verification (emulated email side-channel)
  cy.get('[role="dialog"]', { timeout: 10000 })
    .contains('button', 'Close')
    .click()
  cy.get('[role="dialog"]').should('not.exist')
  cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
    cy.request(link)
  })
  return email
}

/**
 * Sets every field the form renders, clearing whatever was there first so the
 * same helper drives both the initial fill and the modify-everything pass.
 */
function fillApplicationForm(input: ApplicationInput) {
  cy.fillInput('input[name="personal.phoneNumber"]', input.phoneNumber)
  cy.fillInput('input[name="personal.dateOfBirth"]', input.dateOfBirth)
  cy.selectOption('input[name="personal.gender"]', input.gender)

  // Race and courses are checkbox groups: clear the current selection before
  // applying the new one, or the modify pass would add to it rather than
  // replace it and would still pass while writing the wrong value.
  const setCheckboxGroup = (idPrefix: string, values: string[]) => {
    cy.get('body').then(($body) => {
      if ($body.find(`input[id^="${idPrefix}"]:checked`).length > 0) {
        cy.get(`input[id^="${idPrefix}"]:checked`).each(($el) => {
          cy.wrap($el).uncheck({ force: true })
        })
      }
    })
    values.forEach((value) => {
      cy.get(`[id="${idPrefix}${value}"]`).check({ force: true })
    })
  }
  setCheckboxGroup('app-race-', input.race)

  cy.fillInput('input[name="academic.school"]', input.school)
  cy.fillInput(
    'input[name="academic.graduationYear"]',
    String(input.graduationYear),
  )

  setCheckboxGroup('app-course-', input.courses)

  cy.fillInput('input[name="program.preferences"]', input.preferences)
  cy.fillInput('input[name="program.timeSlots"]', input.timeSlots)
  cy.fillInput('textarea[name="program.notAvailable"]', input.notAvailable)

  const setCheckbox = (selector: string, checked: boolean) => {
    if (checked) {
      cy.get(selector).check({ force: true })
    } else {
      cy.get(selector).uncheck({ force: true })
    }
  }
  setCheckbox('input[name="program.inPerson"]', input.programInPerson)
  cy.selectOption('input[name="program.reason"]', input.reason)

  setCheckbox('input[name="essay.taughtBefore"]', input.taughtBefore)
  cy.fillInput(
    'textarea[name="essay.academicBackground"]',
    input.academicBackground,
  )
  // `teachingScenario` and `why` are the new-applicant questions - the form only
  // renders them while `taughtBefore` is false. With it checked they keep
  // whatever `$form` already held, and `ownedFields` writes that back unchanged.
  if (!input.taughtBefore) {
    cy.fillInput(
      'textarea[name="essay.teachingScenario"]',
      input.teachingScenario,
    )
    cy.fillInput('textarea[name="essay.why"]', input.why)
  }

  setCheckbox('input[name="agreements.entireProgram"]', input.entireProgram)
  setCheckbox('input[name="agreements.timeCommitment"]', input.timeCommitment)
  setCheckbox('input[name="agreements.submitting"]', input.submitting)
}

/**
 * The complete document the form is expected to have written. Every save after
 * the bootstrap write is a `{ merge: true }` write, so a field the form fails
 * to send keeps its previous value rather than resetting - which is exactly
 * what a per-field assertion list would miss.
 */
function expectedApplicationDoc(
  input: ApplicationInput,
  context: { email: string; uid: string; submitted: boolean },
) {
  return {
    semester: currentSemester,
    personal: {
      // Owned by the account, not by this form: `toApplyFormValues` omits these
      // so the profile values survive every merge.
      email: context.email,
      firstName: 'Instructor',
      lastName: 'Test',
      phoneNumber: input.phoneNumber,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      race: input.race,
    },
    academic: {
      school: input.school,
      graduationYear: input.graduationYear,
    },
    program: {
      courses: input.courses,
      preferences: input.preferences,
      timeSlots: input.timeSlots,
      notAvailable: input.notAvailable,
      inPerson: input.programInPerson,
      reason: input.reason,
    },
    essay: {
      taughtBefore: input.taughtBefore,
      academicBackground: input.academicBackground,
      teachingScenario: input.teachingScenario,
      why: input.why,
    },
    agreements: {
      entireProgram: input.entireProgram,
      timeCommitment: input.timeCommitment,
      submitting: input.submitting,
    },
    meta: {
      uid: context.uid,
      submitted: context.submitted,
      // Admin's to write: `ownedFields` deliberately never sends `meta`, so
      // these have to still be the values the bootstrap write laid down. If
      // either flips here, the form has started reverting admin's decisions.
      interview: false,
      decided: false,
    },
  }
}

/**
 * Reads the application straight out of the emulator and compares the whole
 * document, so that a form re-render can't stand in for a real write.
 */
function assertApplicationDoc(
  email: string,
  input: ApplicationInput,
  options: { submitted: boolean },
) {
  cy.getFirebaseAuthToken().then((authToken: string) => {
    cy.getFirestoreUserId(authToken, email).then((uid: string) => {
      cy.getFirestoreDoc(authToken, applicationsCollection, uid).then(
        (data: any) => {
          expect(data, 'application document').to.not.equal(null)
          expect(
            prepareDocForCompare(data, {
              sortArraysAt: APPLICATION_ARRAY_FIELDS,
            }),
          ).to.deep.equal(
            prepareDocForCompare(
              expectedApplicationDoc(input, {
                email,
                uid,
                submitted: options.submitted,
              }),
              { sortArraysAt: APPLICATION_ARRAY_FIELDS },
            ),
          )
        },
      )
    })
  })
}

function saveApplicationDraft() {
  cy.contains('button', 'Save draft').click()
  cy.waitForNotification('Your progress was saved.')
}

/**
 * Every field the class details form renders inline on the dashboard.
 *
 * `meetingLink` is deliberately absent: the inline variant offers a
 * "create link" button rather than an input for it, so this form can't set it
 * directly. That makes it a useful control - it must survive every save
 * untouched.
 */
interface ClassDetailsInput {
  course: string
  gradeRecommendation: string
  classDay1: string
  classTime1: string
  classDay2: string
  classTime2: string
  classCap: number
  otherInstructorEmails: string
  online: boolean
  submitting: boolean
  /**
   * Drives the "automatically create a class schedule" checkbox. Set it
   * explicitly rather than relying on the default: `createClassSchedule` is
   * local component state initialised to `true`, but it's rendered through
   * FormCheckbox with a name the schema doesn't contain, and the checkbox that
   * comes up is not checked.
   */
  createSchedule: boolean
}

/** The class the admin seed gives instructor@gbstem.org. */
const SEEDED_CLASS_ID = 'class-python1'
const SEEDED_MEETING_LINK = 'https://zoom.us/j/123456789'
const SEEDED_STUDENTS = ['student-demo-uid-1', 'student1', 'student2']

/**
 * `meetingTimes` and `completedClassDates` hold Firestore timestamps, which
 * `getFirestoreDoc`'s converter returns as raw wrappers; `feedbackCompleted`
 * and `classStatuses` are regenerated per meeting date, so their length tracks
 * the semester's date range rather than anything this form sets. All four are
 * asserted separately by `assertGeneratedSchedule`.
 */
const CLASS_COMPUTED_FIELDS = [
  'meetingTimes',
  'completedClassDates',
  'feedbackCompleted',
  'classStatuses',
]

/**
 * Fills the inline class details form. `classDay2`/`classTime2` only render for
 * a maths course taught online, so the caller has to pick one to reach them.
 */
function fillClassDetailsForm(input: ClassDetailsInput) {
  cy.selectOption('input[name="course"]', input.course)
  cy.fillInput('input[name="gradeRecommendation"]', input.gradeRecommendation)
  cy.selectOption('input[name="classDay1"]', input.classDay1)
  cy.fillInput('input[name="classTime1"]', input.classTime1)

  const showsSecondDay =
    input.course.toLowerCase().includes('math') && input.online
  if (showsSecondDay) {
    cy.selectOption('input[name="classDay2"]', input.classDay2)
    cy.fillInput('input[name="classTime2"]', input.classTime2)
  }

  cy.fillInput('input[name="classCap"]', String(input.classCap))
  cy.fillInput(
    'input[name="otherInstructorEmails"]',
    input.otherInstructorEmails,
  )

  const setCheckbox = (name: string, checked: boolean) => {
    const selector = `input[name="${name}"]`
    if (checked) {
      cy.get(selector).check({ force: true })
    } else {
      cy.get(selector).uncheck({ force: true })
    }
  }
  setCheckbox('online', input.online)
  setCheckbox('submitting', input.submitting)
  setCheckbox('createClassSchedule', input.createSchedule)
}

/**
 * The complete class document the form is expected to have written. Note how
 * much of it the form never renders: `saveClassDetails` is a `{ merge: true }`
 * write of `{ ...values, ...formVal.data }`, so every one of these has to
 * survive, and a regression that drops one shows up here rather than silently
 * in production.
 */
function expectedClassDoc(
  input: ClassDetailsInput,
  context: { meetingLink: string },
) {
  return {
    semester: currentSemester,
    course: input.course,
    gradeRecommendation: input.gradeRecommendation,
    classDay1: input.classDay1,
    classTime1: input.classTime1,
    classDay2: input.classDay2,
    classTime2: input.classTime2,
    classCap: input.classCap,
    otherInstructorEmails: input.otherInstructorEmails,
    online: input.online,
    submitting: input.submitting,
    meetingLink: context.meetingLink,
    // Written from the signed-in profile on every save, never from the form.
    instructorFirstName: 'Demo',
    instructorLastName: 'Instructor',
    instructorEmail: 'instructor@gbstem.org',
    // Owned by registration/admin - the form must not touch the roster.
    students: SEEDED_STUDENTS,
  }
}

function assertClassDoc(
  input: ClassDetailsInput,
  context: { meetingLink: string },
) {
  cy.getFirebaseAuthToken().then((authToken: string) => {
    cy.getFirestoreDoc(authToken, classesCollection, SEEDED_CLASS_ID).then(
      (data: any) => {
        expect(data, 'class document').to.not.equal(null)
        expect(
          prepareDocForCompare(data, { omit: CLASS_COMPUTED_FIELDS }),
        ).to.deep.equal(
          prepareDocForCompare(expectedClassDoc(input, context), {
            omit: CLASS_COMPUTED_FIELDS,
          }),
        )
      },
    )
  })
}

/**
 * The three per-meeting arrays have to stay the same length as each other and
 * as `meetingTimes`, or the feedback form's `classNumber - 1` indexing walks
 * off the end of one of them.
 */
function assertGeneratedSchedule(options: { regenerated: boolean }) {
  cy.getFirebaseAuthToken().then((authToken: string) => {
    cy.getFirestoreDoc(authToken, classesCollection, SEEDED_CLASS_ID).then(
      (data: any) => {
        const count = data.meetingTimes.length
        expect(count, 'meeting times').to.be.greaterThan(0)
        expect(data.feedbackCompleted).to.have.length(count)
        expect(data.classStatuses).to.have.length(count)
        if (options.regenerated) {
          expect(data.feedbackCompleted).to.deep.equal(
            new Array(count).fill(false),
          )
          expect(data.classStatuses).to.deep.equal(
            new Array(count).fill('ClassInFuture'),
          )
        }
      },
    )
  })
}

function saveClassDetails() {
  cy.get('button[type="submit"]').click()
  cy.waitForNotification('Class details saved!')
}

describe('Section C & E: Instructor Applications & Community Service', () => {
  it('Test Case 8: Instructor Application Submission', () => {
    const input: ApplicationInput = {
      phoneNumber: '5559876543',
      dateOfBirth: '2005-10-10',
      gender: 'Female',
      race: ['White'],
      school: 'Harvard University',
      graduationYear: 2028,
      courses: [coursesJson[0].name, coursesJson[1].name],
      preferences: 'Prefer CS courses',
      timeSlots: 'Weekends',
      notAvailable: 'None',
      programInPerson: true,
      reason: 'School',
      taughtBefore: false,
      academicBackground: 'Some programming experience',
      teachingScenario: 'Try interactive games',
      why: 'Want to teach kids',
      entireProgram: true,
      timeCommitment: true,
      submitting: true,
    }

    const email = signUpInstructor()

    cy.visit('/apply')
    cy.get('h1').should('contain', 'Apply')
    cy.get('input[name="personal.phoneNumber"]')
      .should('be.visible')
      .and('not.be.disabled')

    fillApplicationForm(input)

    cy.contains('button', 'Submit').click()

    // Assert successful submission toast
    cy.waitForNotification('Your application has been submitted!')
    cy.verifyEmailSent(email, 'Next steps for your gbSTEM application')

    assertApplicationDoc(email, input, { submitted: true })

    // Reload the page
    cy.visit('/apply')

    // Verify submitted status is displayed
    cy.get('body').should('contain', 'Application submitted and in review!')

    // Verify read-only form has the submitted values
    cy.get('input[name="personal.phoneNumber"]')
      .should('be.disabled')
      .should('have.value', input.phoneNumber)
    cy.get('input[name="personal.dateOfBirth"]')
      .should('be.disabled')
      .should('have.value', input.dateOfBirth)
    cy.get('input[name="academic.school"]')
      .should('be.disabled')
      .should('have.value', input.school)
    cy.get('input[name="academic.graduationYear"]')
      .should('be.disabled')
      .should('have.value', String(input.graduationYear))
    cy.get('input[name="program.preferences"]')
      .should('be.disabled')
      .should('have.value', input.preferences)
    cy.get('input[name="program.timeSlots"]')
      .should('be.disabled')
      .should('have.value', input.timeSlots)
    cy.get('textarea[name="essay.academicBackground"]')
      .should('be.disabled')
      .should('have.value', input.academicBackground)
  })

  it('Test Case 8a: Draft Application - Every Field Reaches Firestore', () => {
    const input: ApplicationInput = {
      phoneNumber: '5550001111',
      dateOfBirth: '2004-02-29',
      gender: 'Non-binary',
      race: ['Korean', 'Middle Eastern'],
      school: 'Draft College',
      graduationYear: 2029,
      courses: [coursesJson[2].name],
      preferences: 'Prefer math courses',
      timeSlots: 'Weekday evenings',
      notAvailable: 'Away in October',
      programInPerson: true,
      reason: 'Friend/family',
      taughtBefore: false,
      academicBackground: 'Two years of tutoring',
      teachingScenario: 'Break the problem down',
      why: 'Enjoy explaining things',
      entireProgram: true,
      timeCommitment: false,
      submitting: false,
    }

    const email = signUpInstructor()

    cy.visit('/apply')
    cy.get('h1').should('contain', 'Apply')
    cy.get('input[name="personal.phoneNumber"]', { timeout: 10000 })
      .should('be.visible')
      .and('not.be.disabled')

    fillApplicationForm(input)
    saveApplicationDraft()

    // The draft save goes through `handleSave`/`$form`, a different path from
    // the submit handler's validated `formVal.data` - so it needs its own check.
    assertApplicationDoc(email, input, { submitted: false })
  })

  it('Test Case 8b: Draft Application - Every Field Can Be Modified', () => {
    const initial: ApplicationInput = {
      phoneNumber: '5552223333',
      dateOfBirth: '2006-06-06',
      gender: 'Male',
      race: ['Chinese'],
      school: 'Before University',
      graduationYear: 2027,
      courses: [coursesJson[0].name],
      preferences: 'Before preferences',
      timeSlots: 'Before timeslots',
      notAvailable: 'Before conflicts',
      programInPerson: true,
      reason: 'School',
      taughtBefore: false,
      academicBackground: 'Before background',
      teachingScenario: 'Before scenario',
      why: 'Before why',
      entireProgram: true,
      timeCommitment: true,
      submitting: false,
    }
    // Every single field differs from `initial`, including every boolean, so a
    // field that silently fails to write shows up as a stale value rather than
    // coincidentally matching.
    const modified: ApplicationInput = {
      phoneNumber: '5554445555',
      dateOfBirth: '2007-07-07',
      gender: 'Female',
      race: ['Japanese', 'White'],
      school: 'After University',
      graduationYear: 2030,
      courses: [coursesJson[1].name, coursesJson[2].name],
      preferences: 'After preferences',
      timeSlots: 'After timeslots',
      notAvailable: 'After conflicts',
      programInPerson: false,
      reason: 'Google search',
      taughtBefore: false,
      academicBackground: 'After background',
      teachingScenario: 'After scenario',
      why: 'After why',
      entireProgram: false,
      timeCommitment: false,
      submitting: true,
    }

    const email = signUpInstructor()

    cy.visit('/apply')
    cy.get('h1').should('contain', 'Apply')
    cy.get('input[name="personal.phoneNumber"]', { timeout: 10000 })
      .should('be.visible')
      .and('not.be.disabled')

    fillApplicationForm(initial)
    saveApplicationDraft()
    assertApplicationDoc(email, initial, { submitted: false })

    // Reload before editing: this is where the saved document is read back
    // through `toApplyFormValues` and pushed into the form, and where a field
    // missing from that mapper would come back empty and then be written back
    // over the stored value.
    cy.visit('/apply')
    cy.get('input[name="personal.phoneNumber"]', { timeout: 10000 })
      .should('not.be.disabled')
      .and('have.value', initial.phoneNumber)

    fillApplicationForm(modified)
    saveApplicationDraft()
    assertApplicationDoc(email, modified, { submitted: false })

    // Checking `taughtBefore` unmounts the two new-applicant essay questions.
    // They should keep the answers already stored rather than being blanked -
    // a returning instructor toggling this must not wipe what they wrote.
    cy.get('input[name="essay.taughtBefore"]').check({ force: true })
    saveApplicationDraft()
    assertApplicationDoc(
      email,
      { ...modified, taughtBefore: true },
      { submitted: false },
    )
  })

  it('Test Case 8c: Instructor Application Status - Accepted', () => {
    cy.signedInSession('instructor')

    cy.get('body').should('contain', 'Your Classes')
    cy.get('a').contains('Community Service Hours Tracker').should('be.visible')

    cy.visit('/apply')
    cy.get('body').should('contain', 'Application submitted and in review!')
    cy.get('input[name="personal.phoneNumber"]').should('be.disabled')
  })

  it('Test Case 8d: Instructor Application Status - Rejected', () => {
    cy.signedInSession('instructor', {
      email: 'instructor-rejected@gbstem.org',
    })

    cy.get('body').contains(
      /we were not able to accept you as an instructor for gbSTEM/,
    )
    cy.get('a').contains('Community Service Hours Tracker').should('not.exist')

    cy.visit('/apply')
    cy.get('body').should('contain', 'Application submitted and in review!')
    cy.signOutViaUi()
  })

  it('Test Case 8e: Instructor Interview Slot Booking & Time Request', () => {
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
    cy.verifyEmailSent(
      'admin@gbstem.org',
      'New Interview Timeslot Request From',
    )
    cy.get('input[name="dateToAdd"]').should('not.exist')
    cy.contains('button', 'Request A Time').should('be.visible')

    // Scenario 2: Book slot
    cy.visit('/dashboard')
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
        cy.verifyEmailSent(
          'instructor-interview@gbstem.org',
          'your interview with',
        )

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
    // Set system clock to 1 day after instructor orientation date so ClassSchedule is rendered
    const orientationDate = new Date(semesterDates.instructorOrientation)
    const postOrientationDate = new Date(
      orientationDate.getTime() + 24 * 60 * 60 * 1000,
    )
    cy.clock(postOrientationDate.getTime(), ['Date'])

    const expectedAttendance: Record<string, { present: boolean }> = {}

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
      // Build the expected attendance map from the roster the form actually
      // rendered - the keys are resolved student names, not uids.
      cy.get('input[name^="attendanceList."]').each(($el, index) => {
        const student = ($el.attr('name') || '')
          .replace(/^attendanceList\./, '')
          .replace(/\.present$/, '')
        expectedAttendance[student] = { present: index === 0 }
      })
      cy.get('input[name^="attendanceList."]').first().check({ force: true })
      cy.contains('button', 'Submit').click({ force: true })
    })
    cy.waitForNotification('Class Feedback saved!')
    cy.get('[role="dialog"]').should('not.exist')

    // `submitInstructorFeedback` writes the feedback document under
    // `${classId}-${Date.now()}`. `cy.clock` above freezes Date, so that id is
    // computable rather than needing a collection scan.
    const feedbackId = `${SEEDED_CLASS_ID}-${postOrientationDate.getTime()}`

    cy.getFirebaseAuthToken().then((authToken: string) => {
      cy.getFirestoreDoc(
        authToken,
        instructorFeedbackCollection,
        feedbackId,
      ).then((data: any) => {
        expect(data, 'instructor feedback document').to.not.equal(null)
        expect(prepareDocForCompare(data)).to.deep.equal({
          semester: currentSemester,
          date: '2026-06-12',
          feedback: 'Class went really well! Students were highly interactive.',
          attendanceList: expectedAttendance,
          classNumber: 1,
          // Empty unless this is a substitute filing the feedback, which this
          // test isn't - it comes from `classBeingSubbed`, not the class.
          courseName: '',
          instructorName: 'Demo Instructor',
        })
      })

      // The same call also advances the class's two per-meeting arrays. They're
      // indexed by `classNumber - 1`, so a mistake here corrupts a different
      // week's status rather than erroring.
      cy.getFirestoreDoc(authToken, classesCollection, SEEDED_CLASS_ID).then(
        (klass: any) => {
          expect(klass.feedbackCompleted[0], 'week 1 feedback done').to.equal(
            true,
          )
          expect(klass.classStatuses[0], 'week 1 status').to.equal(
            'EverythingComplete',
          )
          expect(klass.feedbackCompleted[1], 'week 2 untouched').to.equal(false)
          expect(klass.classStatuses[1], 'week 2 untouched').to.equal(
            'ClassInFuture',
          )
        },
      )
    })
  })

  it('Test Case 11: Instructor Community Service Hours', () => {
    cy.signedInSession('instructor', { initialPage: '/community-service' })

    // Click confirm hours button and verify email notification toast
    cy.contains('button', 'Get Hours Confirmation Email')
      .should('not.be.disabled')
      .click()
    cy.waitForNotification('Email sent successfully!')
    cy.verifyEmailSent(
      'instructor@gbstem.org',
      'gbSTEM Community Service Hours Confirmation',
    )
  })

  it('Test Case 13: Class Details - Every Field Reaches Firestore', () => {
    // A maths course taught online is what makes `classDay2`/`classTime2`
    // render at all, so this is the only combination that reaches every field.
    const input: ClassDetailsInput = {
      course: 'Mathematics 1a',
      gradeRecommendation: '3-5',
      classDay1: 'Tuesday',
      classTime1: '15:30',
      classDay2: 'Thursday',
      classTime2: '16:45',
      classCap: 8,
      otherInstructorEmails: 'cohost@gbstem.org',
      online: true,
      submitting: true,
      createSchedule: true,
    }

    cy.signedInSession('instructor')

    cy.contains('h2', 'Class Details')
      .closest('.rounded-xl')
      .within(() => {
        cy.contains('button', 'Edit class details').click()
      })

    // Only one class details form is mounted at a time, so these selectors
    // don't need the card scoping the `Edit` lookup above required.
    cy.get('input[name="course"]')
      .should('not.be.disabled')
      .and('not.have.value', '')
    fillClassDetailsForm(input)
    saveClassDetails()

    // `createClassSchedule` is left checked (its default), so the meeting dates
    // and the two per-meeting arrays are rebuilt from the semester range.
    assertClassDoc(input, { meetingLink: SEEDED_MEETING_LINK })
    assertGeneratedSchedule({ regenerated: true })
  })

  it('Test Case 13b: Class Details - Every Field Can Be Modified', () => {
    const initial: ClassDetailsInput = {
      course: 'Mathematics 1a',
      gradeRecommendation: '3-5',
      classDay1: 'Tuesday',
      classTime1: '15:30',
      classDay2: 'Thursday',
      classTime2: '16:45',
      classCap: 8,
      otherInstructorEmails: 'before@gbstem.org',
      online: true,
      submitting: true,
      createSchedule: true,
    }
    // Every field differs, including both booleans. `online` going false also
    // hides `classDay2`/`classTime2`, which must then keep their stored values
    // rather than being blanked.
    const modified: ClassDetailsInput = {
      ...initial,
      course: 'Mathematics 2a',
      gradeRecommendation: '6-8',
      classDay1: 'Wednesday',
      classTime1: '17:15',
      classCap: 12,
      otherInstructorEmails: 'after@gbstem.org',
      online: false,
      submitting: false,
      // Editing an existing class: regenerating here would discard the
      // schedule, which is exactly what the checkbox's label warns about.
      createSchedule: false,
    }

    cy.signedInSession('instructor')

    cy.contains('h2', 'Class Details')
      .closest('.rounded-xl')
      .within(() => {
        cy.contains('button', 'Edit class details').click()
      })

    // Only one class details form is mounted at a time, so these selectors
    // don't need the card scoping the `Edit` lookup above required.
    cy.get('input[name="course"]')
      .should('not.be.disabled')
      .and('not.have.value', '')
    fillClassDetailsForm(initial)
    saveClassDetails()
    assertClassDoc(initial, { meetingLink: SEEDED_MEETING_LINK })

    // ClassDetailsForm calls `location.reload()` 2s after a successful save, so
    // wait it out rather than racing it - starting the next edit mid-reload
    // tears the document out from under whatever command is running. The wait
    // is pinned to that literal timer, not guesswork.
    cy.wait(3000)

    // Re-entering edit mode reads the stored document back through
    // `toFormValues`, which is where a field missing from that mapper would
    // come back empty and then be written straight back over the stored value.
    cy.contains('h2', 'Class Details', { timeout: 10000 })
      .closest('.rounded-xl')
      .within(() => {
        cy.contains('button', 'Edit class details').click()
      })
    cy.get('input[name="classCap"]').should(
      'have.value',
      String(initial.classCap),
    )
    fillClassDetailsForm(modified)
    saveClassDetails()

    assertClassDoc(modified, { meetingLink: SEEDED_MEETING_LINK })
    // Left unchecked this pass, so the schedule the first save built survives.
    assertGeneratedSchedule({ regenerated: true })
  })

  it('Test Case 14: Edit Schedule and Add Class', () => {
    // Set system clock to 1 day after instructor orientation date so ClassSchedule is rendered
    const orientationDate = new Date(semesterDates.instructorOrientation)
    const postOrientationDate = new Date(
      orientationDate.getTime() + 24 * 60 * 60 * 1000,
    )
    cy.clock(postOrientationDate.getTime(), ['Date'])

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
    // Set system clock to 1 day after instructor orientation date so ClassSchedule is rendered
    const orientationDate = new Date(semesterDates.instructorOrientation)
    const postOrientationDate = new Date(
      orientationDate.getTime() + 24 * 60 * 60 * 1000,
    )
    cy.clock(postOrientationDate.getTime(), ['Date'])

    cy.signedInSession('instructor')

    // Request Sub
    cy.contains('button', 'Request Sub').first().click()
    cy.get('[role="dialog"]').should('contain', 'Submit A Sub Request')
    cy.get('[role="dialog"]')
      .find('input[type="text"]')
      .type('Sub to cover lists and loops')
    cy.contains('button', 'Confirm Request').click({ force: true })
    cy.waitForNotification('Sub request sent!')
    cy.get('[role="dialog"]').should('not.exist')

    // window.location.reload() fires ~1000ms after the sub request -- give the
    // lookup extra retry budget to span that instead of a fixed pre-wait.
    cy.contains('h2', 'Sign Up To Substitute A Class', {
      timeout: 8000,
    }).should('be.visible')
    // A full page reload resets the whole document, so unlike the lookup
    // above (which only needs the content to exist and retries fine), the
    // checkbox/submit click below needs the reloaded page to actually be
    // interactive again -- verified via a real test run: without this,
    // clicking immediately after the h2 appears occasionally lands before
    // hydration finishes and the signup never fires.
    cy.wait(500)

    // Sign up to substitute a class session and verify confirmation email (/api/substitute)
    cy.contains('h2', 'Sign Up To Substitute A Class')
      .parent()
      .within(() => {
        cy.get('input[type="checkbox"]').first().check({ force: true })
        cy.contains('button', 'Submit').click({ force: true })
      })
    cy.waitForNotification('Signup successful!')
    cy.verifyEmailSent('instructor@gbstem.org', 'Class Substitute Confirmation')
  })
})
