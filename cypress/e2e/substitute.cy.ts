import {
  currentSemester,
  instructorFeedbackCollection,
  substituteRequestsCollection,
} from '../../src/lib/data/collections'
import {
  COHOST_EMAIL,
  COHOST_UID,
  OWNER_EMAIL,
  OWNER_UID,
  SEEDED_CLASS_ID,
  SEEDED_MEETING_LINK,
  SEEDED_STUDENT_EMAIL,
  SEEDED_STUDENT_NAME,
  SUBSTITUTE_EMAIL,
  SUBSTITUTE_UID,
  afterOrientation,
  expectDocExists,
  fileSubRequest,
  readClassDoc,
  subRequestRow,
} from '../support/fixtures'
import { prepareDocForCompare } from '../support/utils'

/**
 * The substitute flow, end to end: an instructor asks for cover, somebody else
 * picks the session up, teaches it, files its feedback and is credited for it.
 *
 * Split out of instructor.cy.ts because it is a flow of its own that spans
 * three accounts and two dashboards, and because almost none of it was covered
 * until recently - every test here was written against a defect. Tests run in
 * file order and each says what it needs from the ones before it.
 */

/** Signs the class's own instructor in on a dashboard that can file requests. */
function signInAsOwner() {
  afterOrientation()
  cy.signedInSession('instructor')
}

/**
 * Files a request as the class's instructor and hands the session number to
 * whoever is covering it next.
 */
function requestCoverForASession(
  notes: string,
  sessionIndex = 0,
): Cypress.Chainable<number> {
  signInAsOwner()
  ensureRequestableSessions(sessionIndex + 1)
  return fileSubRequest(notes, sessionIndex)
}

/**
 * Makes sure the schedule offers at least `count` sessions that can still be
 * asked cover for, adding them if it does not.
 *
 * "Request Sub" only renders for a session that is still in the future and
 * untaught, and this spec teaches some of them - by 15g the seeded class has
 * one session in the past and one already covered and complete, leaving
 * nothing to ask about. Rather than have each test depend on what the ones
 * before it did to the schedule, they say how many they need.
 */
function ensureRequestableSessions(count: number) {
  // The dashboard renders before the class does, and counting buttons on a
  // page that has not drawn its schedule yet always reads zero - which then
  // adds sessions nobody needed, or tries to before the form is there to add
  // them with. "Add Class to Schedule" appears with the schedule itself.
  cy.contains('button', 'Add Class to Schedule', { timeout: 15000 }).should(
    'be.visible',
  )
  cy.get('body').then(($body) => {
    const available = $body.find('button:contains("Request Sub")').length
    for (let i = available; i < count; i += 1) {
      // Late in the semester, so an added session is always in the future of
      // the frozen clock and never collides with a seeded meeting time.
      addSessionToSchedule(`2026-12-0${i + 1}T11:00`)
    }
  })
}

/**
 * Adds a session to the signed-in instructor's class schedule, and closes the
 * "tell the parents" dialog that every schedule change raises.
 */
function addSessionToSchedule(dateTime: string) {
  cy.contains('button', 'Add Class to Schedule').click()
  cy.get('[role="dialog"]').within(() => {
    cy.fillInput('input[type="datetime-local"]', dateTime)
    cy.contains('button', 'Add Class').click({ force: true })
  })
  cy.waitForNotification('Meeting times updated!')
  cy.get('[role="dialog"]').should('contain', "notify your student's parents")
  cy.contains('button', 'Close').click()
  // Closing that dialog reloads the page; the new session is only on the
  // schedule to ask cover for once it has.
  cy.contains('button', 'Request Sub', { timeout: 10000 }).should('be.visible')
}

/**
 * Signs `email` up to substitute the session numbered `classNumber`, from the
 * "Sign Up To Substitute A Class" list every instructor sees.
 */
function signUpToSubstitute(email: string, classNumber: number) {
  afterOrientation()
  cy.signedInSession('instructor', { email })
  cy.contains('h2', 'Sign Up To Substitute A Class')
    .parent()
    .within(() => {
      cy.contains('label', `class #${classNumber}`)
        .find('input[type="checkbox"]')
        .check({ force: true })
      cy.contains('button', 'Submit').click({ force: true })
    })
}

describe('Section I: Substitute Requests And Cover', () => {
  it('Test Case 15: Request Sub', () => {
    signInAsOwner()

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

  it('Test Case 15b: Sub Request - Editing Changes The Request That Exists', () => {
    // The edit and delete buttons built a document id out of the *signed-in
    // uid* (`${uid}---${classNumber}`) while requests are created under the
    // class (`${classId}---${classNumber}`). Those name different documents
    // for every real class, so an edit wrote a phantom request to a path
    // nothing reads and left the real one untouched. Nothing covered either
    // button, which is how it survived.
    const notes = 'Original notes: lists and loops.'
    const editedNotes = 'Edited notes: recursion, slides in Drive.'
    afterOrientation()
    cy.signedInSession('instructor')

    fileSubRequest(notes).then((classNumber) => {
      const movedTo = classNumber + 1
      subRequestRow(classNumber).within(() => {
        cy.contains('button', 'Edit').click()
      })

      cy.get('[role="dialog"]').within(() => {
        cy.get('input[type="number"]').clear().type(String(movedTo))
        cy.get('input[type="text"]').clear().type(editedNotes)
        cy.contains('button', 'Save Edits').click()
      })
      cy.waitForNotification('Sub request updated!')

      cy.getFirebaseAuthToken().then((authToken: string) => {
        cy.getFirestoreDoc(
          authToken,
          substituteRequestsCollection,
          `${SEEDED_CLASS_ID}---${movedTo}`,
        ).then((moved: any) => {
          expect(moved, 'the request at its new session').to.not.equal(null)
          expect(moved.notes).to.equal(editedNotes)
          expect(moved.classNumber).to.equal(movedTo)
          // Still the class's request, and still filed by the same person.
          expect(moved.originalInstructorUid).to.equal(OWNER_UID)
          expect(moved.requestedByUid).to.equal(OWNER_UID)
        })
      })

      // Moving it to another session moves the document...
      expectDocExists(
        `${substituteRequestsCollection}/${SEEDED_CLASS_ID}---${classNumber}`,
        false,
        'the request left behind at the old session',
      )
      // ...and no phantom is written under the instructor's own uid, which is
      // where every edit used to land.
      expectDocExists(
        `${substituteRequestsCollection}/${OWNER_UID}---${movedTo}`,
        false,
        'a phantom request keyed by the signed-in uid',
      )

      // The card reflects it rather than still showing the old session.
      subRequestRow(movedTo).should('contain', 'Substitute Needed')
      cy.contains('h2', 'Your Sub Requests')
        .parent()
        .should('not.contain', `class #${classNumber} `)
    })
  })

  it('Test Case 15c: Sub Request - Deleting One Actually Removes It', () => {
    // Deleting hit the same wrong path, and deleting a document that does not
    // exist succeeds silently - so the toast said "Sub request deleted!" while
    // the request stayed exactly where it was, still asking for a substitute.
    afterOrientation()
    cy.signedInSession('instructor')
    cy.captureConfirms().as('confirms')

    fileSubRequest('Cancelling this one shortly.').then((classNumber) => {
      const docPath = `${substituteRequestsCollection}/${SEEDED_CLASS_ID}---${classNumber}`
      expectDocExists(docPath, true, 'the request that was just filed')

      subRequestRow(classNumber).within(() => {
        // The delete control is the trash icon, which has no text of its own.
        cy.get('button').last().click()
      })
      cy.get('@confirms')
        .its(0)
        .should('contain', 'Are you sure you want to delete this sub request?')
      cy.waitForNotification('Sub request deleted!')

      expectDocExists(docPath, false, 'the request after deleting it')
      cy.contains('h2', 'Your Sub Requests')
        .parent()
        .should('not.contain', `class #${classNumber} `)
    })
  })

  it('Test Case 15d: Sub Request - A Substitute Signs Up And Is Recorded On It', () => {
    // Test Case 15 has the class's own instructor answer their own request,
    // which is the one configuration where every uid in the flow is the same
    // person. This is the real shape: one instructor asks, a different one
    // covers it.
    const notes = 'Prep: finish the loops worksheet, slides are in Drive.'
    afterOrientation()
    cy.signedInSession('instructor')

    fileSubRequest(notes).then((classNumber) => {
      afterOrientation()
      cy.signedInSession('instructor', { email: COHOST_EMAIL })

      cy.contains('h2', 'Sign Up To Substitute A Class')
        .parent()
        .within(() => {
          cy.contains('label', `class #${classNumber}`)
            .find('input[type="checkbox"]')
            .check({ force: true })
          cy.contains('button', 'Submit').click({ force: true })
        })
      cy.waitForNotification('Signup successful!')

      // The confirmation goes to the substitute, copying the class's
      // instructor - who is also the person who asked here, so they are
      // copied once rather than twice - and replies reach them rather than
      // the donotreply address.
      cy.verifyEmailSent(COHOST_EMAIL, 'Class Substitute Confirmation', {
        to: [COHOST_EMAIL],
        cc: [OWNER_EMAIL],
        replyTo: OWNER_EMAIL,
        from: 'donotreply@gbstem.org',
      })

      cy.getFirebaseAuthToken().then((authToken: string) => {
        cy.getFirestoreDoc(
          authToken,
          substituteRequestsCollection,
          `${SEEDED_CLASS_ID}---${classNumber}`,
        ).then((request: any) => {
          expect(request, 'sub request document').to.not.equal(null)
          expect(request.subRequestStatus).to.equal('SubstituteFound')
          expect(request.subInstructorId).to.equal(COHOST_UID)
          expect(request.subInstructorFirstName).to.equal('Cohost')
          expect(request.subInstructorEmail).to.equal(COHOST_EMAIL)
          // Whose class it is, and who asked, are both untouched by somebody
          // else picking the session up.
          expect(request.originalInstructorUid).to.equal(OWNER_UID)
          expect(request.requestedByUid).to.equal(OWNER_UID)
        })
      })

      // It moves onto the substitute's own dashboard, carrying the notes the
      // requester wrote and the address to ask questions at.
      cy.contains('h2', 'Your Classes To Substitute')
        .parent()
        .within(() => {
          cy.contains(`class #${classNumber}`).should('be.visible')
          cy.contains('button', 'View Prep Notes').click()
        })
      cy.get('[role="dialog"]').within(() => {
        cy.contains(notes).should('be.visible')
        cy.contains(OWNER_EMAIL).should('be.visible')
        cy.contains('button', 'Close').click()
      })
    })
  })

  it('Test Case 15e: Sub Request - The Substitute Holds The Class And Files Its Feedback', () => {
    // Continues from Test Case 15d, which left this substitute signed up for
    // a session of the seeded class.
    //
    // Neither half of this worked before: both write to the *class* document
    // (`completedClassDates`, `classStatuses`, `feedbackCompleted`) and
    // firestore.rules opens that only to the class's own instructors, which a
    // substitute is not. "Join" failed to the console and nowhere else, and
    // the feedback failed halfway - the feedback document saved, so the form
    // said "Class Feedback saved!", while the class was never updated and the
    // request never left "feedback needed". Both go through the server now.
    const feedback = 'Covered lists and loops; the group got through it all.'
    afterOrientation()
    cy.signedInSession('instructor', { email: COHOST_EMAIL })
    cy.captureConfirms().as('confirms')
    cy.window().then((win) => {
      // "Join" opens the meeting in a new tab; the stub keeps that out of the
      // run and lets the link itself be asserted.
      cy.stub(win, 'open').as('windowOpen')
    })

    // The card renders before its data arrives ("You are not currently
    // substituting any classes."), and `invoke('text')` reads whatever is
    // there at that moment rather than retrying - so wait for the row itself.
    cy.contains('h2', 'Your Classes To Substitute')
      .parent()
      .should('contain', 'class #')
    cy.contains('h2', 'Your Classes To Substitute')
      .parent()
      .invoke('text')
      .then((cardText) => {
        const match = cardText.match(/class #(\d+)/)
        expect(match, 'a class to substitute').to.not.equal(null)
        const classNumber = Number((match as RegExpMatchArray)[1])
        const sessionIndex = classNumber - 1

        let before: any
        readClassDoc().then((data: any) => {
          before = data
        })

        cy.contains('h2', 'Your Classes To Substitute')
          .parent()
          .within(() => {
            cy.contains('button', 'Join').click()
          })
        cy.get('@confirms')
          .its(0)
          .should('contain', 'confirm you are holding class now')
        cy.get('@windowOpen').should(
          'have.been.calledWith',
          SEEDED_MEETING_LINK,
        )

        // The session is marked held on the class - a write the substitute
        // could not make from the browser at all.
        readClassDoc().then((after: any) => {
          expect(
            after.completedClassDates.length,
            'the session was recorded as held',
          ).to.equal((before.completedClassDates ?? []).length + 1)
          expect(after.classStatuses[sessionIndex]).to.equal(
            'FeedbackIncomplete',
          )
        })
        cy.getFirebaseAuthToken().then((authToken: string) => {
          cy.getFirestoreDoc(
            authToken,
            substituteRequestsCollection,
            `${SEEDED_CLASS_ID}---${classNumber}`,
          ).then((request: any) => {
            expect(request.subRequestStatus).to.equal(
              'SubstituteFeedbackNeeded',
            )
          })
        })

        // ...and then the feedback, which completes the session and closes the
        // request out. The document id is server-generated, so it comes back
        // from the endpoint rather than being computed from a frozen clock.
        cy.intercept('POST', '/api/substituteFeedback').as('substituteFeedback')
        cy.contains('h2', 'Your Classes To Substitute')
          .parent()
          .within(() => {
            cy.contains('button', 'Submit Feedback').click()
          })

        const expectedAttendance: Record<string, { present: boolean }> = {}
        cy.get('[role="dialog"]').within(() => {
          cy.contains(/substitute class feedback form/i).should('be.visible')
          cy.fillInput('input[name="classDate"]', '2026-10-09')
          cy.fillInput('input[name="feedback"]', feedback)
          cy.get('input[name^="attendanceList."]').each(($el, index) => {
            const student = ($el.attr('name') || '')
              .replace(/^attendanceList\./, '')
              .replace(/\.present$/, '')
            expectedAttendance[student] = { present: index === 0 }
          })
          cy.get('input[name^="attendanceList."]')
            .first()
            .check({ force: true })
          cy.contains('button', 'Submit').click({ force: true })
        })
        cy.waitForNotification('Class Feedback saved!')

        cy.wait('@substituteFeedback')
          .its('response.body.feedbackId')
          .then((feedbackId: string) => {
            cy.getFirebaseAuthToken().then((authToken: string) => {
              cy.getFirestoreDoc(
                authToken,
                instructorFeedbackCollection,
                feedbackId,
              ).then((data: any) => {
                expect(data, 'substitute feedback document').to.not.equal(null)
                expect(prepareDocForCompare(data)).to.deep.equal({
                  semester: currentSemester,
                  date: '2026-10-09',
                  feedback,
                  attendanceList: expectedAttendance,
                  classNumber,
                  // Both taken from the sub request rather than the form: the
                  // course the substitute covered, and their own name.
                  courseName: before.course,
                  instructorName: 'Cohost',
                })
              })

              cy.getFirestoreDoc(
                authToken,
                substituteRequestsCollection,
                `${SEEDED_CLASS_ID}---${classNumber}`,
              ).then((request: any) => {
                // What credits the substitute's community service hours.
                expect(request.subRequestStatus).to.equal('NoSubstituteNeeded')
              })
            })
            readClassDoc().then((after: any) => {
              expect(after.feedbackCompleted[sessionIndex]).to.equal(true)
              expect(after.classStatuses[sessionIndex]).to.equal(
                'EverythingComplete',
              )
            })
          })
      })
  })

  it('Test Case 15f: Sub Request - A Covered Class Earns The Substitute Their Hours', () => {
    // The end of the line for the sub request from 15d/15e, and the reason any
    // of it matters to an instructor: hours are counted from requests in the
    // `NoSubstituteNeeded` state, which nothing could reach before, so a
    // substitute's 1.5 hours per covered class were never credited at all.
    //
    // This account teaches no class of its own and co-instructs none in this
    // spec, so every hour on the page is substitute hours - one covered class
    // at 1.5 hours each.
    cy.signedInSession('instructor', {
      email: COHOST_EMAIL,
      initialPage: '/community-service',
    })

    cy.contains('h2', 'You have completed 1 classes').should('be.visible')
    cy.contains('equaling 1.5 total hours').should('be.visible')
    // The two <strong>s in that line are instruction hours then substitute
    // hours; the second is the one this test exists for.
    cy.contains('div', 'as a substitute instructor')
      .find('strong')
      .eq(0)
      .should('have.text', '0')
    cy.contains('div', 'as a substitute instructor')
      .find('strong')
      .eq(1)
      .should('have.text', '1.5')
  })

  it('Test Case 15g: Sub Request - The Substitute Can Remind The Class', () => {
    // "Send Reminder" on the substitute's own card looked up the roster with
    // the *sub request* id (`${classId}---${classNumber}`) rather than the
    // class id, so it found no class, got an empty roster back, and quietly
    // sent nothing: sendClassReminder loops over the students and there were
    // none, so the confirm appeared and then nothing happened at all - no
    // email, no error, no toast. Nothing covered this button.
    requestCoverForASession('Prep: worksheet 4.').then((classNumber) => {
      signUpToSubstitute(COHOST_EMAIL, classNumber)
      cy.waitForNotification('Signup successful!')
      cy.captureConfirms().as('confirms')

      cy.contains('h2', 'Your Classes To Substitute')
        .parent()
        .should('contain', `class #${classNumber}`)
      cy.contains('h2', 'Your Classes To Substitute')
        .parent()
        .within(() => {
          cy.contains('button', 'Send Reminder').click()
        })
      cy.get('@confirms')
        .its(0)
        .should('contain', 'Send class reminder to all students')
      cy.waitForNotification('Reminder emails were sent!')

      // Signed by the substitute rather than the class's instructor - for
      // this one session they are who the students are meeting.
      cy.verifyEmailSent(SEEDED_STUDENT_EMAIL, 'gbSTEM Class Reminder', {
        to: [SEEDED_STUDENT_EMAIL],
      }).then((reminder: any) => {
        expect(reminder.html).to.contain('Cohost')
      })
    })
  })

  it('Test Case 15h: Sub Request - A Substitute-Only Instructor Gets The Substitute Dashboard', () => {
    // An instructor whose decision is `substitute` rather than `accepted` gets
    // a different dashboard: the "Substitute Classes" card, with no class of
    // their own to run and no requests of their own to manage. That account
    // type existed in the decision union and in the dashboard for as long as
    // both have, and nothing had ever signed in as one.
    requestCoverForASession('Prep: the fractions worksheet.').then(
      (classNumber) => {
        afterOrientation()
        cy.signedInSession('instructor', { email: SUBSTITUTE_EMAIL })

        cy.contains('h2', 'Substitute Classes').should('be.visible')
        cy.get('body').should(
          'contain',
          'You have been accepted as a substitute instructor',
        )
        // The parts of the dashboard that belong to someone teaching their own
        // class stay away: no schedule, no class details form, and no sub
        // requests of their own (SubClasses is rendered with subInstructor).
        // Anchored, because "Your Classes To Substitute" is on this page and
        // a substring match would find it and pass for the wrong reason.
        cy.contains('h2', /^Your Classes$/).should('not.exist')
        cy.contains('h2', 'Class Details').should('not.exist')
        cy.contains('h2', 'Your Sub Requests').should('not.exist')
        // What they do get is the list of sessions needing cover.
        cy.contains('h2', 'Sign Up To Substitute A Class').should('be.visible')

        signUpToSubstitute(SUBSTITUTE_EMAIL, classNumber)
        cy.waitForNotification('Signup successful!')

        cy.getFirebaseAuthToken().then((authToken: string) => {
          cy.getFirestoreDoc(
            authToken,
            substituteRequestsCollection,
            `${SEEDED_CLASS_ID}---${classNumber}`,
          ).then((request: any) => {
            expect(request.subInstructorId).to.equal(SUBSTITUTE_UID)
            expect(request.subInstructorEmail).to.equal(SUBSTITUTE_EMAIL)
            expect(request.subRequestStatus).to.equal('SubstituteFound')
          })
        })
        cy.contains('h2', 'Your Classes To Substitute')
          .parent()
          .should('contain', `class #${classNumber}`)
      },
    )
  })

  it('Test Case 15i: Sub Request - One Substitute Can Take Several Sessions At Once', () => {
    // The signup list is a checkbox group over whole request objects with a
    // single Submit, so claiming two sessions is one submission that has to
    // fan out into two writes and two confirmation emails. Only ever covered
    // one box at a time before.
    requestCoverForASession('First session needing cover.', 0).then((first) => {
      requestCoverForASession('Second session needing cover.', 1).then(
        (second) => {
          expect(second, 'a different session from the first').to.not.equal(
            first,
          )

          afterOrientation()
          cy.signedInSession('instructor', { email: COHOST_EMAIL })
          cy.contains('h2', 'Sign Up To Substitute A Class')
            .parent()
            .within(() => {
              cy.contains('label', `class #${first}`)
                .find('input[type="checkbox"]')
                .check({ force: true })
              cy.contains('label', `class #${second}`)
                .find('input[type="checkbox"]')
                .check({ force: true })
              cy.contains('button', 'Submit').click({ force: true })
            })
          cy.waitForNotification('Signup successful!')

          cy.getFirebaseAuthToken().then((authToken: string) => {
            ;[first, second].forEach((classNumber) => {
              cy.getFirestoreDoc(
                authToken,
                substituteRequestsCollection,
                `${SEEDED_CLASS_ID}---${classNumber}`,
              ).then((request: any) => {
                expect(
                  request.subInstructorId,
                  `session ${classNumber} was claimed`,
                ).to.equal(COHOST_UID)
                expect(request.subRequestStatus).to.equal('SubstituteFound')
              })
            })
          })
          // Both land on their dashboard, not just the one that was checked
          // last.
          cy.contains('h2', 'Your Classes To Substitute')
            .parent()
            .should('contain', `class #${first}`)
            .and('contain', `class #${second}`)
        },
      )
    })
  })

  it('Test Case 15j: Sub Request - Cancelling One That Already Has A Substitute', () => {
    // Plans change after somebody has signed up, and that row has its own
    // delete button - a different branch from the one Test Case 15c covers,
    // and the one where getting the document id wrong would have left a
    // substitute expecting to teach a class the instructor thought they had
    // called off.
    requestCoverForASession('Might not need this after all.').then(
      (classNumber) => {
        signUpToSubstitute(COHOST_EMAIL, classNumber)
        cy.waitForNotification('Signup successful!')

        signInAsOwner()
        cy.captureConfirms().as('confirms')
        subRequestRow(classNumber)
          .should('contain', 'Substitute Found')
          .within(() => {
            cy.get('button').last().click()
          })
        cy.waitForNotification('Sub request deleted!')

        expectDocExists(
          `${substituteRequestsCollection}/${SEEDED_CLASS_ID}---${classNumber}`,
          false,
          'the cancelled request',
        )
        // ...and it stops appearing on the substitute's dashboard too.
        afterOrientation()
        cy.signedInSession('instructor', { email: COHOST_EMAIL })
        cy.contains('h2', 'Your Classes To Substitute')
          .parent()
          .should('not.contain', `class #${classNumber} `)
      },
    )
  })

  it('Test Case 15k: Sub Request - A Failed Signup Says So', () => {
    // The confirmation email is sent by /api/substitute, and a failure there
    // is the one thing between signing up and believing you have. The claim
    // itself has already been written when it fires, so the error has to be
    // visible or the substitute is left unsure whether they are covering the
    // class.
    requestCoverForASession('Prep notes for a signup that fails.').then(
      (classNumber) => {
        cy.intercept('POST', '/api/substitute', {
          statusCode: 500,
          body: { error: 'Failed to send email. Please try again later.' },
        }).as('substituteEmail')

        signUpToSubstitute(COHOST_EMAIL, classNumber)

        cy.wait('@substituteEmail')
        cy.waitForNotification(
          'Error signing up to substitute, please try again.',
          'bg-red-200',
        )
      },
    )
  })
})
