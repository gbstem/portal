import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import type { FirebaseError } from 'firebase-admin'
import {
  SENDGRID_API_TOKEN,
} from '$env/static/private'
import { addDataToHtmlTemplate, formatTime24to12 } from '$lib/utils'
import { onlineClassEnrolledEmailTemplate } from '$lib/data/emailTemplates/onlineClassEnrolledEmailTemplate'
import { inPersonClassEnrolledEmailTemplate } from '$lib/data/emailTemplates/inPersonClassEnrolledEmailTemplate'
import MailService, { type MailDataRequired } from '@sendgrid/mail'

export const POST: RequestHandler = async ({ request, locals }) => {
  let topError
  try {
    const body = await request.json()
    try {
      if (locals.user === null) {
        throw error(400, 'User not signed in.')
      } else {
        const classTimes: string[] = body.classTimes
        const classDays: string[] = body.classDays
        const classes = classDays.map(
          (day, index) => `${day} at ${formatTime24to12(classTimes[index])}`,
        )
        const class1Time = classes[0]
        const class2Time = classes[1]

        const template = {
          name: 'interviewScheduled',
          data: {
            subject: `${body.course} class details for ${body.studentName}`,
            app: {
              name: 'Portal',
              link: 'https://portal.gbstem.org',
              instructor: body.instructor,
              firstName: body.firstName,
              class1Time: class1Time,
              class2Time: class2Time,
              meetingLink: body.meetingLink,
              course: body.course,
              instructorEmail: body.instructorEmail,
              online: body.online,
              studentName: body.studentName,
            }
          },
        }

        const emailTemplate = body.online ? onlineClassEnrolledEmailTemplate : inPersonClassEnrolledEmailTemplate

        const htmlBody = addDataToHtmlTemplate(emailTemplate, template);

        const emailData: MailDataRequired = {
          to: locals.user.email,
          cc: body.instructorEmail,
          from: 'donotreply@gbstem.org',
          subject: String(template.data.subject),
          html: htmlBody,
          replyTo: 'contact@gbstem.org',
          text: 'Class Enrollment Confirmation',
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

