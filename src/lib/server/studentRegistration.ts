import {
  registrationDraftSchema,
  registrationSchema,
} from '#lib/components/forms/schemas.js'
import {
  maxChildrenPerAccount,
  registrationsCollection,
  semesterDates,
  withSemester,
} from '#lib/data/collections.js'
import { registrationDocId } from '#lib/data/docIds.js'
import { renderEmail } from '#lib/emails/render.js'
import {
  createBootstrapRegistration,
  normalizeRegistrationData,
  registrationOwnedFields,
  toRegistrationFormValues,
} from '#lib/helpers/registrationForm.js'
import { sendEmail } from '#lib/server/email.js'
import { adminDb } from '#lib/server/firebase.js'
import { profileNames } from '#lib/server/userProfile.js'
import { error } from '@sveltejs/kit'
import { FieldValue } from 'firebase-admin/firestore'
import type { z } from 'zod'

/**
 * A parent's student registrations, read and written only here, with the
 * Admin SDK.
 *
 * `/apply`'s form actions call into this module. RegistrationForm used to write
 * the documents itself through the client SDK, so the schema, the
 * registration window and the after-submit lock were only ever enforced in the
 * parent's own browser.
 *
 * Children are addressed by number - the parent's 1st, 2nd, ... student - and
 * never by document id: the id is always built here from the signed-in
 * parent's uid, so no request can name someone else's registration.
 *
 * firestore.rules gives parents no write access to registrations at all, so
 * this module is the only way a parent's registration changes.
 */

export interface ParentCaller {
  uid: string
  email: string
}

/** One entry in `/apply`'s child picker. */
export interface ChildSummary {
  number: number
  name: string
  submitted: boolean
}

type DraftData = z.infer<typeof registrationDraftSchema>
type SubmitData = z.infer<typeof registrationSchema>

/** What `/apply` needs to render one child's form. Serializable. */
export interface RegistrationView {
  values: ReturnType<typeof toRegistrationFormValues>
  studentFirstName: string
  parentFirstName: string
  parentLastName: string
  submitted: boolean
}

function registrationRef(parentUid: string, childNumber: number) {
  return adminDb.doc(
    `${registrationsCollection}/${registrationDocId(parentUid, childNumber)}`,
  )
}

/**
 * The parent's registrations in child order, stopping at the first number
 * with no document - the picker has always ended at the first gap.
 */
export async function listChildren(parentUid: string): Promise<ChildSummary[]> {
  const snaps = await Promise.all(
    Array.from({ length: maxChildrenPerAccount }, (_, i) =>
      registrationRef(parentUid, i + 1).get(),
    ),
  )
  const children: ChildSummary[] = []
  for (const [i, snap] of snaps.entries()) {
    if (!snap.exists) break
    const data = snap.data() as Data.Registration
    const name =
      `${data.personal?.studentFirstName ?? ''} ${data.personal?.studentLastName ?? ''}`.trim()
    children.push({
      number: i + 1,
      name: name || `Child ${i + 1}`,
      submitted: Boolean(data.meta?.submitted),
    })
  }
  return children
}

/**
 * Whether `childNumber` is one `/apply` may open for a parent who already has
 * `existingCount` children: one of theirs, or the next one, up to
 * `maxChildrenPerAccount`.
 */
export function isOpenableChild(
  childNumber: number,
  existingCount: number,
): boolean {
  return (
    Number.isInteger(childNumber) &&
    childNumber >= 1 &&
    childNumber <= Math.min(existingCount + 1, maxChildrenPerAccount)
  )
}

/**
 * Reads one of the caller's registrations for display, creating the draft the
 * first time a child is opened and refreshing a draft's parent names from the
 * profile. Returns null, and neither reads nor writes, while registrations
 * aren't open: the page shows when they open instead, as it always has.
 *
 * The draft is created with the whole default shape because admin's dashboard
 * and registrations list query on `meta.submitted == false`, and a draft
 * missing that field would be invisible there.
 */
export async function loadRegistration(
  caller: ParentCaller,
  childNumber: number,
  isOpen: boolean,
): Promise<RegistrationView | null> {
  if (!isOpen) return null
  const ref = registrationRef(caller.uid, childNumber)
  const names = await profileNames(caller.uid)
  const registration = await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists) {
      const created = createBootstrapRegistration(
        registrationDocId(caller.uid, childNumber),
        names.firstName,
        names.lastName,
        caller.email,
        FieldValue.serverTimestamp(),
      )
      transaction.set(ref, withSemester(created))
      return created
    }
    const stored = normalizeRegistrationData(snap.data())
    if (
      !stored.meta.submitted &&
      (stored.personal.parentFirstName !== names.firstName ||
        stored.personal.parentLastName !== names.lastName)
    ) {
      transaction.set(
        ref,
        {
          personal: {
            parentFirstName: names.firstName,
            parentLastName: names.lastName,
            email: caller.email,
          },
        },
        { merge: true },
      )
      stored.personal.parentFirstName = names.firstName
      stored.personal.parentLastName = names.lastName
    }
    return stored
  })

  return {
    values: toRegistrationFormValues(registration),
    studentFirstName: registration.personal.studentFirstName,
    parentFirstName: registration.personal.parentFirstName,
    parentLastName: registration.personal.parentLastName,
    submitted: Boolean(registration.meta.submitted),
  }
}

/**
 * Merges the form's fields into one of the caller's registrations inside a
 * transaction that refuses the write once it is submitted. Returns what the
 * registration looked like before the write.
 */
async function writeOwnedFields(
  caller: ParentCaller,
  childNumber: number,
  formData: DraftData | SubmitData,
  submit: boolean,
): Promise<Data.Registration> {
  const ref = registrationRef(caller.uid, childNumber)
  return adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref)
    if (!snap.exists) {
      throw error(404, 'Reload the page to start this registration.')
    }
    const stored = normalizeRegistrationData(snap.data())
    if (stored.meta.submitted) {
      throw error(409, 'This registration has already been submitted.')
    }
    transaction.set(
      ref,
      withSemester({
        ...registrationOwnedFields(
          stored,
          formData,
          caller.email,
          FieldValue.serverTimestamp(),
        ),
        ...(submit ? { meta: { submitted: true } } : {}),
      }),
      { merge: true },
    )
    return stored
  })
}

/** Saves one of the caller's unfinished registrations. */
export async function saveRegistrationDraft(
  caller: ParentCaller,
  childNumber: number,
  formData: DraftData,
  window: { opens: Date },
  now: Date = new Date(),
): Promise<void> {
  if (now < window.opens) {
    throw error(403, 'Registration has not opened yet.')
  }
  await writeOwnedFields(caller, childNumber, formData, false)
}

/**
 * Submits one of the caller's registrations and emails the next steps to the
 * parent and to the second guardian's address, if one was given.
 *
 * Refused outside the registration window and when the registration was
 * already submitted. `formData` has to have passed `registrationSchema`, which
 * is what requires the agreements. As with applications, a failed email
 * doesn't undo the submission.
 */
export async function submitRegistration(
  caller: ParentCaller,
  childNumber: number,
  formData: SubmitData,
  window: { opens: Date; closes: Date },
  now: Date = new Date(),
): Promise<{ emailSent: boolean }> {
  if (now < window.opens) {
    throw error(403, 'Registration has not opened yet.')
  }
  if (now >= window.closes) {
    throw error(403, 'The registration deadline has passed.')
  }
  await writeOwnedFields(caller, childNumber, formData, true)

  const { firstName } = await profileNames(caller.uid)
  const secondaryEmail = formData.personal.secondaryEmail
  const data = {
    subject: 'Next steps for your gbSTEM registration',
    app: {
      firstName,
      studentName: formData.personal.studentFirstName,
      parentOrientationDate: semesterDates.parentOrientation,
      name: 'Portal',
      link: 'https://portal.gbstem.org',
    },
  }
  try {
    await sendEmail({
      to: secondaryEmail ? [caller.email, secondaryEmail] : caller.email,
      subject: data.subject,
      html: renderEmail('registrationSubmittedEmailTemplate', data),
    })
    return { emailSent: true }
  } catch (err) {
    console.error('[studentRegistration] confirmation email failed:', err)
    return { emailSent: false }
  }
}
