import { verifyInstructor, handleApiError } from '#lib/server/apiHelpers.js'
import {
  COMMUNITY_SERVICE_SIGNATORIES,
  communityServiceSummary,
} from '#lib/server/communityService.js'
import { sendEmail } from '#lib/server/email.js'
import { profileNames } from '#lib/server/userProfile.js'
import { renderEmail } from '#lib/emails/render.js'
import type { RequestHandler } from './$types'

/**
 * Emails the signed-in instructor a confirmation of their community-service
 * hours. Every figure in it is computed server-side (see
 * communityServiceSummary): the email is an attestation from gbSTEM, so the
 * request carries nothing but the session.
 *
 * Any instructor may ask, not only one accepted this semester, so someone who
 * taught in an earlier semester can still get their substitute hours
 * confirmed.
 */
export const POST: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyInstructor(locals)
    const [summary, { firstName }] = await Promise.all([
      communityServiceSummary(user.uid),
      profileNames(user.uid),
    ])

    const template = {
      name: 'communityServiceEmail',
      data: {
        subject: `gbSTEM Community Service Hours Confirmation for ${firstName}`,
        app: {
          firstName,
          hours: summary.totalHours,
          season: summary.season,
          year: summary.year,
          course: summary.course,
          presidents: COMMUNITY_SERVICE_SIGNATORIES,
          name: 'Portal',
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = renderEmail('communityServiceEmailTemplate', template.data)

    try {
      await sendEmail({
        to: user.email,
        subject: String(template.data.subject),
        html: htmlBody,
      })
    } catch (mailError) {
      return Response.json(
        { error: 'Failed to send email. Please try again later.' },
        { status: 500 },
      )
    }

    return Response.json({ message: 'Email sent successfully.' })
  } catch (err) {
    throw handleApiError('/api/communityService', err)
  }
}
