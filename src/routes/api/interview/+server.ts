import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import type { FirebaseError } from 'firebase-admin'
import {
  SENDGRID_API_TOKEN,
} from '$env/static/private'
import { addDataToHtmlTemplate } from '$lib/utils'
import { interviewScheduledEmailTemplate } from '$lib/data/emailTemplates/interviewScheduledEmailTemplate'
import MailService, { type MailDataRequired } from '@sendgrid/mail'

export const POST: RequestHandler = async ({ request, locals }) => {
  let topError
  try {
    const body = await request.json()
    try {
      const interviewerEmail = body.email;
      const interviewDate = body.date
      const interviewLink = body.link;
      const interviewerName = body.interviewer;
      const intervieweeFirstName = body.firstName;
      if (locals.user === null) {
        throw error(400, 'User not signed in.')
      } else {
        const template = {
          name: 'interviewScheduled',
          data: {
            subject: `${intervieweeFirstName}, your interview with ${interviewerName} has been scheduled`,
            app: {
              name: 'Portal',
              link: 'https://portal.gbstem.org',
            },
            interview: {
              interviewee: intervieweeFirstName,
              name: interviewerName,
              date: interviewDate,
              link: interviewLink,
            }
          },
        }

        const htmlBody = addDataToHtmlTemplate(interviewScheduledEmailTemplate, template);

        const emailData: MailDataRequired = {
          from: 'donotreply@gbstem.org',
          to: locals.user.email,
          cc: interviewerEmail,
          subject: String(template.data.subject),
          html: htmlBody,
          replyTo: interviewerEmail,
          text: 'Interview Scheduled',
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
      }
    } catch (err) {
      if (typeof err === 'string') {
        topError = error(400, err)
      } else {
        const typedErr = err as
          | FirebaseError
          | {
            errorInfo: FirebaseError
            codePrefix: string
          }
        if ('errorInfo' in typedErr) {
          topError = error(
            400,
            typedErr.errorInfo.message ||
            'Please wait a few minutes before trying again.',
          )
        } else if ('message' in typedErr) {
          topError = error(400, typedErr.message)
        } else {
          topError = error(400, 'Something went wrong. Please try again.')
        }
      }
    }
  } catch (err) {
    topError = error(400, 'Invalid request body.')
  }
  throw topError

}
