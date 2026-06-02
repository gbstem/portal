import { applicationSubmittedEmailTemplate } from '$lib/data/emailTemplates/applicationSubmittedEmailTemplate'
import { sendEmail } from '$lib/server/email'
import { addDataToHtmlTemplate } from '$lib/utils'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export interface ApplicationRequestBody {
  firstName: string
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = (await request.json()) as ApplicationRequestBody
  const firstName = body.firstName
  if (locals.user === null) {
    throw error(400, 'User not signed in.')
  } else {
    const template = {
      name: 'applicationSubmitted',
      data: {
        subject: 'Next steps for your gbSTEM application',
        app: {
          firstName: firstName,
          name: 'Portal',
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = addDataToHtmlTemplate(
      applicationSubmittedEmailTemplate,
      template,
    )

    try {
      await sendEmail({
        to: locals.user.email,
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
  }
}
