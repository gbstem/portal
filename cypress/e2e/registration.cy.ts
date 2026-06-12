import { generateDateHash } from '../support/utils'

describe('Section B: Student Registration & Account Management', () => {
  beforeEach(() => {
    // Clear session
    cy.clearAllCookies()
    cy.clearAllLocalStorage()
    cy.clearAllSessionStorage()

    // Sign up a brand new parent account to guarantee zero existing children
    const email = `${generateDateHash('parent')}@gbstem.org`
    cy.visit('/signup')
    cy.get('h1').should('contain', 'Sign up')
    cy.get('input[name="firstName"]').should('be.visible')
    cy.wait(2500) // Wait for signup initialization and HMR/Firebase to settle

    cy.selectOption(
      'input[name="role"]',
      'Parent registering my child for classes',
    )
    cy.fillInput('input[name="firstName"]', 'Parent')
    cy.fillInput('input[name="lastName"]', 'Test')
    cy.fillInput('input[name="email"]', email)
    cy.fillInput('input[name="password"]', 'penguin')
    cy.fillInput('input[name="confirmPassword"]', 'penguin')
    cy.get('button[type="submit"]').click()

    // Handle email verification
    cy.get('[role="dialog"]').contains('button', 'Go to dashboard').click()
    cy.getLatestOobLink(email, 'VERIFY_EMAIL').then((link) => {
      cy.request(link)
    })
    cy.wrap(email).as('parentEmail')
  })

  it('Test Case 6: Parent Registration - Manage Multiple Children', () => {
    cy.visit('/apply')
    cy.get('h1').should('contain', 'Student Account Creation')
    cy.wait(1000) // Wait for Svelte page to settle

    // Assert Child 1 exists by default
    cy.get('input[name="select-a-child"]').should('have.value', 'Child 1')

    // Click "Add Child Account" to add Child 2, 3, 4, 5
    for (let i = 2; i <= 5; i++) {
      cy.contains('button', 'Add Child Account').click()
      cy.wait(300)
      cy.get('input[name="select-a-child"]').should('have.value', `Child ${i}`)
    }

    // Try to click a 6th time and assert blocked
    cy.contains('button', 'Add Child Account').click()
    cy.waitForNotification('You can only register up to 5 children')
  })

  it('Test Case 7: Complete and Submit a Registration Form', () => {
    cy.visit('/apply')
    cy.get('h1').should('contain', 'Student Account Creation')
    cy.wait(1000)

    // Select Child 1 to register
    cy.get('input[name="select-a-child"]').should('have.value', 'Child 1')

    const studentFirst = 'Charlie'
    const studentLast = generateDateHash('Brown')
    const phone = '5551234567'
    const dob = '2015-05-15'
    const school = 'Pine Crest Elementary'

    // Fill personal details
    cy.get('input[name="personal.studentFirstName"]').should('not.be.disabled')
    cy.fillInput('input[name="personal.studentFirstName"]', studentFirst)
    cy.fillInput('input[name="personal.studentLastName"]', studentLast)
    cy.fillInput(
      'input[name="personal.secondaryEmail"]',
      'secondary@gbstem.org',
    )
    cy.fillInput('input[name="personal.phoneNumber"]', phone)
    cy.fillInput('input[name="personal.dateOfBirth"]', dob)

    cy.selectOption('input[name="personal.gender"]', 'Male')
    cy.get('#race-Chinese').check({ force: true })
    cy.selectOption('input[name="personal.frlp"]', 'No')
    cy.selectOption('input[name="personal.parentEducation"]', "Master's degree")

    // Fill academic details
    cy.fillInput('input[name="academic.school"]', school)
    cy.selectOption('input[name="student-grade"]', '5')

    // Check agreements
    cy.get('input[name="agreements.entireProgram"]').check({ force: true })
    cy.get('input[name="agreements.timeCommitment"]').check({ force: true })
    cy.get('input[name="agreements.submitting"]').check({ force: true })

    // Click Submit
    cy.contains('button', 'Submit').click()

    // Assert successful submission toast
    cy.waitForNotification('Your student account has been created!')

    // Verify written data directly in the database emulator
    /* TODO(dmeyer246) Broken getFirestoreUserId()
    cy.get('@parentEmail').then((emailAddress: string) => {
      cy.getFirebaseAuthToken().then((authToken: string) => {
        cy.getFirestoreUserId(authToken, emailAddress).then((uid: string) => {
          cy.getFirestoreDoc(authToken, 'registrationsSpring26', `${uid}-1`).then((data) => {
            expect(data).to('not.be.null')
            expect(data.personal.studentFirstName).to.equal(studentFirst)
            expect(data.personal.studentLastName).to.equal(studentLast)
            expect(data.personal.secondaryEmail).to.equal('secondary@gbstem.org')
            expect(data.personal.phoneNumber).to.equal(phone)
            expect(data.personal.dateOfBirth).to.equal(dob)
            expect(data.academic.school).to.equal(school)
            expect(data.agreements.entireProgram).to.equal(true)
            expect(data.agreements.timeCommitment).to.equal(true)
            expect(data.agreements.submitting).to.equal(true)
            expect(data.meta.submitted).to.equal(true)
          })
        })
      })
    })
    */

    // Reload the page and select Child 1
    cy.visit('/apply')
    cy.wait(1000)
    cy.selectOption(
      'input[name="select-a-child"]',
      `${studentFirst} ${studentLast}`,
    )
    cy.wait(500)

    // Verify submitted values persist (should display the submitted account card layout)
    cy.get('body').should(
      'contain',
      `An account has been created for ${studentFirst}!`,
    )
  })
})
