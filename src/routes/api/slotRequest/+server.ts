import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import {
  SENDGRID_API_TOKEN,
} from '$env/static/private'
import { addDataToHtmlTemplate } from '$lib/utils'
import { interviewRequestedEmailTemplate } from '$lib/data/emailTemplates/interviewRequestedEmailTemplate'
import MailService, { type MailDataRequired } from '@sendgrid/mail'

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
    try {
      await MailService.send(emailData);
      console.log('Email sent');
    } catch (mailError) {
      console.error('Error sending email:', mailError);
      return json({ error: 'Failed to send email. Please try again later.' }, { status: 500 });
  }
     return json({ message: 'Email sent successfully.' });
     
    return new Response()
  }
}
