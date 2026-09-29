import { registrationsCollection, semesterDates } from '$lib/data/collections'
import { isOwnRegistration } from '$lib/data/docIds'
import { verifyStudent, handleApiError } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { adminDb } from '$lib/server/firebase'
import { renderEmail } from '$lib/emails/render'
import { error, json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const registrationSchema = z.object({
  registrationId: z.string().min(1, 'A registration is required'),
})

export type RegistrationRequestBody = z.infer<typeof registrationSchema>

/**
 * Sends the "next steps" email for one of the caller's submitted
 * registrations, to the parent account and the registration's second
 * guardian.
 *
 * Takes only the registration's id. Everything the email says, and the
 * second address it goes to, is read server-side from the caller's own
 * profile and registration and from semesterDates. It used to take the names,
 * orientation date and second address from the request body, so any signed-in
 * account could have gbSTEM send branded email with its own text to any
 * address at all.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyStudent(locals)
    const { registrationId } = registrationSchema.parse(await request.json())
    if (!isOwnRegistration(user.uid, registrationId)) {
      throw error(403, 'That is not one of your registrations.')
    }

    const [registrationSnap, profileSnap] = await Promise.all([
      adminDb.doc(`${registrationsCollection}/${registrationId}`).get(),
      adminDb.doc(`users/${user.uid}`).get(),
    ])
    const registration = registrationSnap.data() as
      Data.Registration | undefined
    if (!registrationSnap.exists || !registration?.meta?.submitted) {
      throw error(404, 'That registration has not been submitted.')
    }
    const profile = profileSnap.data() ?? {}
    const secondaryEmail = registration.personal?.secondaryEmail

    const template = {
      name: 'registrationSubmitted',
      data: {
        subject: 'Next steps for your gbSTEM registration',
        app: {
          firstName: profile.firstName ?? '',
          studentName: registration.personal?.studentFirstName ?? '',
          parentOrientationDate: semesterDates.parentOrientation,
          name: 'Portal',
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = renderEmail(
      'registrationSubmittedEmailTemplate',
      template.data,
    )

    const to = secondaryEmail ? [user.email, secondaryEmail] : user.email

    try {
      await sendEmail({
        to,
        subject: String(template.data.subject),
        html: htmlBody,
      })
    } catch (mailError) {
      return json(
        { error: 'Failed to send email. Please try again later.' },
        { status: 500 },
      )
    }

    return json({ message: 'Email sent successfully.' })
  } catch (err) {
    throw handleApiError('/api/registration', err)
  }
}
