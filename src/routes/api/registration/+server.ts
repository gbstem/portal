import { registrationSubmittedEmailTemplate } from '$lib/data/emailTemplates/registrationSubmittedEmailTemplate'
import { sendEmail } from '$lib/server/email'
import { addDataToHtmlTemplate } from '$lib/utils'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export interface RegistrationRequestBody {
  firstName: string
  studentName: string
  secondaryEmail?: string
  parentOrientationDate: string
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = (await request.json()) as RegistrationRequestBody
  const firstName = body.firstName
  const studentName = body.studentName
  const secondaryEmail = body.secondaryEmail
  if (locals.user === null) {
    throw error(400, 'User not signed in.')
  } else {
    const template = {
      name: 'registrationSubmitted',
      data: {
        subject: 'Next steps for your gbSTEM registration',
        app: {
          firstName: firstName,
          studentName: studentName,
          parentOrientationDate: body.parentOrientationDate,
          name: 'Portal',
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = addDataToHtmlTemplate(
      registrationSubmittedEmailTemplate,
      template,
    )

    const to = secondaryEmail
      ? [locals.user.email, secondaryEmail]
      : locals.user.email

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
  }
}
