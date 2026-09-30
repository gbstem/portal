import {
  applicationDraftSchema,
  applicationSchema,
} from '$lib/components/forms/schemas'
import {
  applicationsCollection,
  semesterDates,
  withSemester,
} from '$lib/data/collections'
import {
  applicationOwnedFields,
  normalizeApplicationData,
  toApplyFormValues,
} from '$lib/helpers/applyForm'
import { renderEmail } from '$lib/emails/render'
import { sendEmail } from '$lib/server/email'
import { adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'
import { FieldValue } from 'firebase-admin/firestore'
import type { z } from 'zod'

/**
 * The instructor application, read and written only here, with the Admin SDK.
 *
 * `/apply`'s form actions call into this module. The form used to write the
 * document itself through the client SDK, so everything it enforced - the
 * schema, the deadline, and that a submitted application can't be edited - was
 * only ever enforced in the applicant's own browser.
 *
 * TODO(server-side-forms): once RegistrationForm is also server-side, take
 * `create`/`update` on `applications` away from applicants in firestore.rules
 * (both repos). Until then an applicant can still bypass all of this with a
 * direct client-SDK write.
 */

export interface ApplicantCaller {
  uid: string
  email: string
}

type DraftData = z.infer<typeof applicationDraftSchema>
type SubmitData = z.infer<typeof applicationSchema>

/** What `/apply` needs to render the form. Serializable, so no Timestamps. */
export interface ApplicationView {
  values: ReturnType<typeof toApplyFormValues>
  firstName: string
  lastName: string
  submitted: boolean
}

function applicationRef(uid: string) {
  return adminDb.doc(`${applicationsCollection}/${uid}`)
}

async function profileNames(uid: string) {
  const profile = (await adminDb.doc(`users/${uid}`).get()).data() ?? {}
  return {
    firstName: String(profile.firstName ?? ''),
    lastName: String(profile.lastName ?? ''),
  }
}

/**
 * The UTC offset of New York at `at`, in minutes (e.g. -240 during EDT).
 */
function newYorkOffsetMinutes(at: Date): number {
  const name =
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT-5'
  const match = /GMT([+-]\d+)(?::(\d+))?/.exec(name)
  if (!match) return -300
  const hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  return hours * 60 + Math.sign(hours) * minutes
}

/**
 * The first instant applications are closed: midnight in New York at the end
 * of the due date, which the form advertises as "due <date> at 11:59 PM ET".
 *
 * `env.E2E_INSTRUCTOR_APPS_DUE` replaces the due date, and only while the
 * Firestore emulator is in use - Cypress can move the browser's clock but not
 * the server's, so without it the e2e submit test could only pass during an
 * application window.
 */
export function applicationDeadline(
  env: Record<string, string | undefined>,
): Date {
  const override = env.FIRESTORE_EMULATOR_HOST
    ? env.E2E_INSTRUCTOR_APPS_DUE
    : undefined
  const due = new Date(override || semesterDates.newInstructorAppsDue)
  const midnightAfterUtc = new Date(
    Date.UTC(due.getFullYear(), due.getMonth(), due.getDate() + 1),
  )
  return new Date(
    midnightAfterUtc.getTime() -
      newYorkOffsetMinutes(midnightAfterUtc) * 60_000,
  )
}

/**
 * Reads the caller's application for display, creating the draft on the
 * first visit and refreshing a draft's names from the profile.
 *
 * The draft is created here, with the whole default shape, because admin's
 * dashboard and applications list query on `meta.submitted == false` /
 * `meta.decided == false`, and a draft missing those fields would be invisible
 * there.
 */
export async function loadApplication(
  caller: ApplicantCaller,
): Promise<ApplicationView> {
  const ref = applicationRef(caller.uid)
  const names = await profileNames(caller.uid)
  const application = await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    const stored = snap.exists ? (snap.data() as Data.Application) : null
    const normalized = normalizeApplicationData(
      stored,
      { uid: caller.uid, email: caller.email },
      names,
    )
    if (!stored) {
      transaction.set(
        ref,
        withSemester({
          ...normalized,
          timestamps: {
            created: FieldValue.serverTimestamp(),
            updated: FieldValue.serverTimestamp(),
          },
        }),
      )
    } else if (
      !stored.meta?.submitted &&
      (stored.personal?.firstName !== names.firstName ||
        stored.personal?.lastName !== names.lastName)
    ) {
      transaction.set(
        ref,
        {
          personal: {
            firstName: names.firstName,
            lastName: names.lastName,
            email: caller.email,
          },
        },
        { merge: true },
      )
    }
    return stored ? { ...stored, personal: { ...stored.personal } } : normalized
  })

  const submitted = Boolean(application.meta?.submitted)
  return {
    values: toApplyFormValues(application),
    // A submitted application keeps the names it was submitted under.
    firstName: submitted ? application.personal.firstName : names.firstName,
    lastName: submitted ? application.personal.lastName : names.lastName,
    submitted,
  }
}

/**
 * Merges the form's fields into the caller's application inside a
 * transaction that refuses the write once the application is submitted.
 */
async function writeOwnedFields(
  caller: ApplicantCaller,
  formData: DraftData | SubmitData,
  submit: boolean,
): Promise<void> {
  const ref = applicationRef(caller.uid)
  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists) {
      throw error(404, 'Reload the page to start your application.')
    }
    const stored = normalizeApplicationData(snap.data())
    if (stored.meta.submitted) {
      throw error(409, 'Your application has already been submitted.')
    }
    transaction.set(
      ref,
      withSemester({
        ...applicationOwnedFields(
          stored,
          formData,
          caller.email,
          FieldValue.serverTimestamp(),
        ),
        // Only `submitted` - `interview` and `decided` belong to admin and
        // are left to the merge.
        ...(submit ? { meta: { submitted: true } } : {}),
      }),
      { merge: true },
    )
  })
}

/** Saves the caller's unfinished application. */
export async function saveApplicationDraft(
  caller: ApplicantCaller,
  formData: DraftData,
): Promise<void> {
  await writeOwnedFields(caller, formData, false)
}

/**
 * The rules `applicationSchema` can't express without becoming a ZodEffects,
 * which superforms' defaults and `formFieldParity.test.ts` both walk as a
 * plain object. The form marks these fields `required`, but only the browser
 * ever checked that.
 */
function submissionProblem(data: SubmitData): string | null {
  const { agreements, essay } = data
  if (
    !agreements.entireProgram ||
    !agreements.timeCommitment ||
    !agreements.submitting
  ) {
    return 'Please accept every agreement before submitting.'
  }
  if (!essay.taughtBefore && (!essay.teachingScenario || !essay.why)) {
    return 'Please answer every essay question before submitting.'
  }
  return null
}

/**
 * Submits the caller's application and emails them the next steps.
 *
 * Refused after the deadline, when an agreement or a required essay is
 * missing, and when the application was already submitted. The email is sent
 * after the write commits and doesn't undo it when it fails: the application
 * is in, and saying otherwise would invite a resubmission that the lock then
 * refuses.
 */
export async function submitApplication(
  caller: ApplicantCaller,
  formData: SubmitData,
  deadline: Date,
  now: Date = new Date(),
): Promise<{ emailSent: boolean }> {
  if (now >= deadline) {
    throw error(403, 'The application deadline has passed.')
  }
  const problem = submissionProblem(formData)
  if (problem) throw error(400, problem)

  await writeOwnedFields(caller, formData, true)

  const { firstName } = await profileNames(caller.uid)
  const data = {
    subject: 'Next steps for your gbSTEM application',
    app: {
      firstName,
      name: 'Portal',
      link: 'https://portal.gbstem.org',
    },
  }
  try {
    await sendEmail({
      to: caller.email,
      subject: data.subject,
      html: renderEmail('applicationSubmittedEmailTemplate', data),
    })
    return { emailSent: true }
  } catch (err) {
    console.error('[instructorApplication] confirmation email failed:', err)
    return { emailSent: false }
  }
}
