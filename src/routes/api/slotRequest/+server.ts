import { interviewRequestedEmailTemplate } from '$lib/data/emailTemplates/interviewRequestedEmailTemplate'
import { sendEmail } from '$lib/server/email'
import { addDataToHtmlTemplate } from '$lib/utils'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json()
  if (locals.user === null) {
    throw error(400, 'User not signed in.')
  } else {
    const template = {
      name: 'interviewSlotRequest',
      data: {
        subject: `New Interview Timeslot Request From ${body.firstName} `,
        interview: {
          firstName: body.firstName,
          timeSlot: body.timeSlot,
          email: body.intervieweeEmail,
          name: 'Portal',
          link: 'https://admin.gbstem.org',
        },
      },
    }

    const htmlBody = addDataToHtmlTemplate(
      interviewRequestedEmailTemplate,
      template,
    )

    try {
      await sendEmail({
        to: 'admin@gbstem.org',
        cc: 'contact@gbstem.org',
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
