import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import postmark from 'postmark'
import {
  SENDGRID_API_TOKEN,
} from '$env/static/private'
import { addDataToHtmlTemplate } from '$lib/utils'
import { interviewRequestedEmailTemplate } from '$lib/data/emailTemplates/interviewRequestedEmailTemplate'
import MailService, { MailDataRequired } from '@sendgrid/mail'

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
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

    const htmlBody = addDataToHtmlTemplate(interviewRequestedEmailTemplate, template);

    const emailData: MailDataRequired = {
      from: 'donotreply@gbstem.org',
      to: 'admin@gbstem.org',
      cc: 'contact@gbstem.org',
      subject: String(template.data.subject),
      html: htmlBody,
      replyTo: 'contact@gbstem.org',
      text: 'New Interview Timeslot Request',
    }
    MailService.setApiKey(SENDGRID_API_TOKEN)
    MailService
    .send(emailData)
    .then(() => {
    console.log('Email sent')
    })
    .catch((error) => {
    console.error(error.toString())
    })

    return new Response()
  }
}
