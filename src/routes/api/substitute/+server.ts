import { substituteClassEmailTemplate } from '$lib/data/emailTemplates/substituteClassEmailTemplate'
import { sendEmail } from '$lib/server/email'
import { addDataToHtmlTemplate } from '$lib/utils'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json()
  if (locals.user === null) {
    throw error(400, 'User not signed in.')
  } else {
    const subInstructorEmail = body.subInstructorEmail
    const originalInstructorEmail = body.originalInstructorEmail
    const template = {
      name: 'interviewSlotRequest',
      data: {
        subject: `Class Substitute Confirmation`,
        app: {
          firstName: body.firstName,
          course: body.course,
          classNumber: body.classNumber,
          date: body.date,
          name: 'Portal',
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = addDataToHtmlTemplate(
      substituteClassEmailTemplate,
      template,
    )

    try {
      await sendEmail({
        to: subInstructorEmail,
        cc: originalInstructorEmail,
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
