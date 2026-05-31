import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { SENDGRID_API_TOKEN } from '$env/static/private'
import { addDataToHtmlTemplate } from '$lib/utils'
import { substituteClassEmailTemplate } from '$lib/data/emailTemplates/substituteClassEmailTemplate'
import MailService, { type MailDataRequired } from '@sendgrid/mail'

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

    const emailData: MailDataRequired = {
      from: 'donotreply@gbstem.org',
      to: subInstructorEmail,
      cc: originalInstructorEmail,
      subject: String(template.data.subject),
      html: htmlBody,
      replyTo: 'contact@gbstem.org',
      text: 'Class Substitute Confirmation',
    }
    MailService.setApiKey(SENDGRID_API_TOKEN)
    try {
      await MailService.send(emailData)
      console.log('Email sent')
    } catch (mailError) {
      console.error('Error sending email:', mailError)
      return json(
        { error: 'Failed to send email. Please try again later.' },
        { status: 500 },
      )
    }
    return json({ message: 'Email sent successfully.' })

    return new Response()
  }
}
