import {
  currentSemester,
  maxChildrenPerAccount,
  registrationsCollection,
} from '../../src/lib/data/collections'
import { generateDateHash, prepareDocForCompare } from '../support/utils'

/** Every field the portal's registration form actually renders. */
interface RegistrationInput {
  studentFirstName: string
  studentLastName: string
  secondaryEmail: string
  phoneNumber: string
  dateOfBirth: string
  gender: string
  race: string[]
  frlp: string
  parentEducation: string
  school: string
  grade: string
  mediaRelease: boolean
  entireProgram: boolean
  timeCommitment: boolean
  submitting: boolean
}

// `bind:group` stores checkbox selections in tick order, which isn't meaningful.
const REGISTRATION_ARRAY_FIELDS = ['personal.race']

/**
 * Sets every field the form renders, clearing whatever was there first so the
 * same helper drives both the initial fill and the modify-everything pass.
 */
function fillRegistrationForm(input: RegistrationInput) {
  cy.fillInput(
    'input[name="personal.studentFirstName"]',
    input.studentFirstName,
  )
  cy.fillInput('input[name="personal.studentLastName"]', input.studentLastName)
  cy.fillInput('input[name="personal.secondaryEmail"]', input.secondaryEmail)
  cy.fillInput('input[name="personal.phoneNumber"]', input.phoneNumber)
  cy.fillInput('input[name="personal.dateOfBirth"]', input.dateOfBirth)
  cy.selectOption('input[name="personal.gender"]', input.gender)

  // Race is a checkbox group, so clear the current selection before applying
  // the new one - otherwise the modify pass would add to it rather than
  // replace it, and would still pass while writing the wrong value.
  cy.get('body').then(($body) => {
    if ($body.find('input[id^="race-"]:checked').length > 0) {
      cy.get('input[id^="race-"]:checked').each(($el) => {
        cy.wrap($el).uncheck({ force: true })
      })
    }
  })
  input.race.forEach((race) => {
    cy.get(`[id="race-${race}"]`).check({ force: true })
  })

  cy.selectOption('input[name="personal.frlp"]', input.frlp)
  cy.selectOption(
    'input[name="personal.parentEducation"]',
    input.parentEducation,
  )

  cy.fillInput('input[name="academic.school"]', input.school)
  cy.selectOption('input[name="student-grade"]', input.grade)

  const setCheckbox = (name: string, checked: boolean) => {
    const selector = `input[name="agreements.${name}"]`
    if (checked) {
      cy.get(selector).check({ force: true })
    } else {
      cy.get(selector).uncheck({ force: true })
    }
  }
  setCheckbox('mediaRelease', input.mediaRelease)
  setCheckbox('entireProgram', input.entireProgram)
  setCheckbox('timeCommitment', input.timeCommitment)
  setCheckbox('submitting', input.submitting)
}

/**
 * The complete document the form is expected to have written, including the
 * groups it never renders. Those matter as much as the rendered ones: every
 * save after the bootstrap write is a `{ merge: true }` write, so a field the
 * form fails to send keeps whatever was there before rather than resetting -
 * which is exactly the failure a per-field assertion list would miss.
 */
function expectedRegistrationDoc(
  input: RegistrationInput,
  context: { parentEmail: string; childUid: string; submitted: boolean },
) {
  return {
    semester: currentSemester,
    personal: {
      studentFirstName: input.studentFirstName,
      studentLastName: input.studentLastName,
      // Owned by the parent's account, not by this form: `ownedFields` re-pins
      // these from `values` on every write.
      parentFirstName: 'Parent',
      parentLastName: 'Test',
      email: context.parentEmail,
      secondaryEmail: input.secondaryEmail,
      phoneNumber: input.phoneNumber,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      race: input.race,
      frlp: input.frlp,
      parentEducation: input.parentEducation,
    },
    academic: {
      school: input.school,
      grade: input.grade,
    },
    // Not rendered in the portal - admin assigns courses after registration -
    // so these keep the defaults the bootstrap write laid down.
    program: {
      csCourse: '',
      mathCourse: '',
      engineeringCourse: '',
      scienceCourse: '',
      inPerson: false,
      reason: '',
    },
    inPerson: {
      allergies: '',
      parentPickup: '',
    },
    agreements: {
      mediaRelease: input.mediaRelease,
      // Admin-only: `ownedFields` deliberately never sends it, so it has to
      // still be the `false` the bootstrap write left. If this ever comes back
      // as something else, the form has started clobbering an admin waiver.
      bypassAgeLimits: false,
      entireProgram: input.entireProgram,
      timeCommitment: input.timeCommitment,
      submitting: input.submitting,
    },
    meta: {
      uid: context.childUid,
      submitted: context.submitted,
    },
  }
}

/**
 * Reads child 1's registration straight out of the emulator and compares the
 * whole document, so that a form re-render can't stand in for a real write.
 */
function assertRegistrationDoc(
  input: RegistrationInput,
  options: { submitted: boolean },
) {
  cy.get('@parentEmail').then((parentEmail: any) => {
    const parentEmailStr = parentEmail as string
    cy.getFirebaseAuthToken().then((authToken: string) => {
      cy.getFirestoreUserId(authToken, parentEmailStr).then((uid: string) => {
        const childUid = `${uid}-1`
        cy.getFirestoreDoc(authToken, registrationsCollection, childUid).then(
          (data: any) => {
            expect(data, 'registration document').to.not.equal(null)
            expect(
              prepareDocForCompare(data, {
                sortArraysAt: REGISTRATION_ARRAY_FIELDS,
              }),
            ).to.deep.equal(
              prepareDocForCompare(
                expectedRegistrationDoc(input, {
                  parentEmail: parentEmailStr,
                  childUid,
                  submitted: options.submitted,
                }),
                { sortArraysAt: REGISTRATION_ARRAY_FIELDS },
              ),
            )
          },
        )
      })
    })
  })
}

function saveDraft() {
  cy.contains('button', 'Save draft').click()
  cy.waitForNotification('Your progress was saved.')
}

describe('Section B: Student Registration & Account Management', () => {
  beforeEach(() => {
    // Sign up a brand new parent account to guarantee zero existing children
    const email = `${generateDateHash('parent')}@gbstem.org`
    cy.loadSignupPage()
    cy.selectOption(
      'input[name="role"]',
      'Parent registering my child for classes',
      { timeout: 10000 },
    )
    cy.fillInput('input[name="firstName"]', 'Parent')
    cy.fillInput('input[name="lastName"]', 'Test')
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', 'penguin')
    cy.fillInput('input[name="confirmPassword"]', 'penguin')
    cy.get('button[type="submit"]').click()

    // Handle email verification (emulated email side-channel)
    cy.get('[role="dialog"]').contains('button', 'Close').click()
    cy.get('[role="dialog"]').should('not.exist')
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })
    cy.wrap(email).as('parentEmail')
  })

  it('Test Case 6: Parent Registration - Manage Multiple Children', () => {
    cy.visit('/apply')
    cy.get('h1').should('contain', 'Student Account Creation')

    // Assert Child 1 exists by default
    cy.get('input[name="select-a-child"]', { timeout: 10000 }).should(
      'have.value',
      'Child 1',
    )

    // Click "Add Child Account" to add new children up to maxChildrenPerAccount
    for (let i = 2; i <= maxChildrenPerAccount; i++) {
      cy.contains('button', 'Add Child Account').click()
      cy.get('input[name="select-a-child"]').should('have.value', `Child ${i}`)
    }

    // Try to click one more time and assert blocked
    cy.contains('button', 'Add Child Account').click()
    cy.waitForNotification(
      `You can only register up to ${maxChildrenPerAccount} children`,
      'bg-red-200',
    )
  })

  it('Test Case 7: Complete and Submit a Registration Form', () => {
    const input: RegistrationInput = {
      studentFirstName: 'Charlie',
      studentLastName: generateDateHash('Brown'),
      secondaryEmail: 'secondary@gbstem.org',
      phoneNumber: '5551234567',
      dateOfBirth: '2015-05-15',
      gender: 'Male',
      race: ['Chinese', 'White'],
      frlp: 'No',
      parentEducation: "Master's degree",
      school: 'Pine Crest Elementary',
      grade: '5',
      mediaRelease: true,
      entireProgram: true,
      timeCommitment: true,
      submitting: true,
    }

    cy.visit('/apply')
    cy.get('h1').should('contain', 'Student Account Creation')

    // Select Child 1 to register
    cy.get('input[name="select-a-child"]', { timeout: 10000 }).should(
      'have.value',
      'Child 1',
    )

    cy.get('input[name="personal.studentFirstName"]').should('not.be.disabled')
    fillRegistrationForm(input)

    cy.contains('button', 'Submit').click()

    // Assert successful submission toast
    cy.waitForNotification('Your student account has been created!')
    cy.get('@parentEmail').then((parentEmail) => {
      cy.verifyEmailSent(
        parentEmail as unknown as string,
        'Next steps for your gbSTEM registration',
      )
    })

    assertRegistrationDoc(input, { submitted: true })

    // Reload the page and select Child 1
    cy.visit('/apply')
    cy.wait(1000)
    cy.selectOption(
      'input[name="select-a-child"]',
      `${input.studentFirstName} ${input.studentLastName}`,
      { timeout: 10000 },
    )

    // Verify submitted values persist (should display the submitted account card layout)
    cy.get('body').should(
      'contain',
      `An account has been created for ${input.studentFirstName}!`,
    )
    cy.get('input[name="personal.studentFirstName"]').should('not.exist')
  })

  it('Test Case 7b: Draft Registration - Every Field Reaches Firestore', () => {
    const input: RegistrationInput = {
      studentFirstName: 'Draft',
      studentLastName: generateDateHash('Student'),
      secondaryEmail: 'draft-secondary@gbstem.org',
      phoneNumber: '5550001111',
      dateOfBirth: '2014-03-09',
      gender: 'Non-binary',
      race: ['Korean', 'Middle Eastern'],
      frlp: 'Yes',
      parentEducation: "Bachelor's degree",
      school: 'Draft Elementary',
      grade: '3',
      mediaRelease: true,
      entireProgram: true,
      timeCommitment: false,
      submitting: false,
    }

    cy.visit('/apply')
    cy.get('h1').should('contain', 'Student Account Creation')
    cy.get('input[name="personal.studentFirstName"]', {
      timeout: 10000,
    }).should('not.be.disabled')

    fillRegistrationForm(input)
    saveDraft()

    // The draft save goes through `handleSave`/`$form`, a different path from
    // the submit handler's validated `formVal.data` - so it needs its own check.
    assertRegistrationDoc(input, { submitted: false })
  })

  it('Test Case 7c: Draft Registration - Every Field Can Be Modified', () => {
    const initial: RegistrationInput = {
      studentFirstName: 'Before',
      studentLastName: generateDateHash('Edit'),
      secondaryEmail: 'before@gbstem.org',
      phoneNumber: '5552223333',
      dateOfBirth: '2013-01-02',
      gender: 'Male',
      race: ['Chinese'],
      frlp: 'No',
      parentEducation: "Master's degree",
      school: 'Before Elementary',
      grade: '4',
      mediaRelease: true,
      entireProgram: true,
      timeCommitment: true,
      submitting: false,
    }
    // Every single field differs from `initial`, including every boolean, so a
    // field that silently fails to write shows up as a stale value rather than
    // coincidentally matching.
    const modified: RegistrationInput = {
      studentFirstName: 'After',
      studentLastName: generateDateHash('Edited'),
      secondaryEmail: 'after@gbstem.org',
      phoneNumber: '5554445555',
      dateOfBirth: '2012-11-30',
      gender: 'Female',
      race: ['Japanese', 'White'],
      frlp: "I don't know",
      parentEducation: 'Less than high school',
      school: 'After Elementary',
      grade: '7',
      mediaRelease: false,
      entireProgram: false,
      timeCommitment: false,
      submitting: true,
    }

    cy.visit('/apply')
    cy.get('h1').should('contain', 'Student Account Creation')
    cy.get('input[name="personal.studentFirstName"]', {
      timeout: 10000,
    }).should('not.be.disabled')

    fillRegistrationForm(initial)
    saveDraft()
    assertRegistrationDoc(initial, { submitted: false })

    // Reload before editing: this is where the saved document is read back
    // through `normalizeRegistrationData` -> `toRegistrationFormValues` and
    // pushed into the form, and where a field missing from either mapper would
    // come back empty and then be written back over the stored value.
    cy.visit('/apply')
    cy.get('input[name="select-a-child"]', { timeout: 10000 }).should(
      'have.value',
      `${initial.studentFirstName} ${initial.studentLastName}`,
    )
    cy.get('input[name="personal.studentFirstName"]', { timeout: 10000 })
      .should('not.be.disabled')
      .and('have.value', initial.studentFirstName)

    fillRegistrationForm(modified)
    saveDraft()
    assertRegistrationDoc(modified, { submitted: false })
  })
})
