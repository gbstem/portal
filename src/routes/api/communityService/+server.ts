import { communityServiceEmailTemplate } from '$lib/data/emailTemplates/communityServiceEmailTemplate'
import { verifyAuthenticated, handleApiError } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { addDataToHtmlTemplate } from '$lib/utils'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export interface CommunityServiceRequestBody {
  firstName: string
  hours: number | string
  season: string
  year: number | string
  course: string
  presidents: string
  email: string
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAuthenticated(locals)
    const body = (await request.json()) as CommunityServiceRequestBody
    const firstName = body.firstName
    const email = body.email

    const template = {
      name: 'communityServiceEmail',
      data: {
        subject: `gbSTEM Community Service Hours Confirmation for ${firstName}`,
        app: {
          firstName: firstName,
          hours: body.hours,
          season: body.season,
          year: body.year,
          course: body.course,
          presidents: body.presidents,
          name: 'Portal',
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = addDataToHtmlTemplate(
      communityServiceEmailTemplate,
      template,
    )

    try {
      await sendEmail({
        to: email,
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
    throw handleApiError(err)
  }
}
