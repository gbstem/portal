import {
  applicationDraftSchema,
  applicationSchema,
} from '#lib/components/forms/schemas.js'
import { applicationsCollection, withSemester } from '#lib/data/collections.js'
import {
  applicationOwnedFields,
  normalizeApplicationData,
  toApplyFormValues,
} from '#lib/helpers/applyForm.js'
import { renderEmail } from '#lib/emails/render.js'
import { sendEmail } from '#lib/server/email.js'
import { adminDb } from '#lib/server/firebase.js'
import { profileNames } from '#lib/server/userProfile.js'
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
 * firestore.rules gives applicants no write access to applications at all,
 * so this module is the only way an applicant's application changes.
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
 * Submits the caller's application and emails them the next steps.
 *
 * Refused after the deadline and when the application was already
 * submitted. `formData` has to have passed `applicationSchema`, which is what
 * requires the agreements and the newcomer essays. The email is sent
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
