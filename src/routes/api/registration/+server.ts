import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import {
  SENDGRID_API_TOKEN,
} from '$env/static/private'
import { addDataToHtmlTemplate } from '$lib/utils'
import { registrationSubmittedEmailTemplate } from '$lib/data/emailTemplates/registrationSubmittedEmailTemplate'
import MailService, { type MailDataRequired } from '@sendgrid/mail'

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json();
  const firstName = body.firstName;
  const studentName = body.studentName;
  const secondaryEmail = body.secondaryEmail;
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

    const htmlBody = addDataToHtmlTemplate(registrationSubmittedEmailTemplate, template);

    const emailData: MailDataRequired = {
      from: 'donotreply@gbstem.org',
      to: secondaryEmail !== '' ? `${locals.user.email}, ${secondaryEmail}` : locals.user.email,
      cc: '',
      subject: String(template.data.subject),
      html: htmlBody,
      replyTo: 'contact@gbstem.org',
      text: 'Registration Submitted',
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
