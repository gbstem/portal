import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import type { FirebaseError } from 'firebase-admin'
import { SENDGRID_API_TOKEN } from '$env/static/private'
import { addDataToHtmlTemplate } from '$lib/utils'
import { classReminderEmailTemplate } from '$lib/data/emailTemplates/classReminderEmailTemplate'
import MailService, { type MailDataRequired } from '@sendgrid/mail'

export const POST: RequestHandler = async ({ request, locals }) => {
  let topError
  try {
    const body = await request.json()
    try {
      const email = body.email
      const otherInstructorEmails = body.otherInstructorEmails
      if (locals.user === null) {
        throw error(400, 'User not signed in.')
      } else {
        const template = {
          name: 'classReminder',
          data: {
            subject: 'gbSTEM Class Reminder',
            app: {
              firstName: body.name,
              name: 'Portal',
              class: body.class,
              classTime: body.classTime,
              instructor: body.instructorName,
            },
          },
        }

        const htmlBody = addDataToHtmlTemplate(
          classReminderEmailTemplate,
          template,
        )

        const emailData: MailDataRequired = {
          from: 'donotreply@gbstem.org',
          to: email,
          cc: otherInstructorEmails,
          subject: String(template.data.subject),
          html: htmlBody,
          replyTo: 'contact@gbstem.org',
          text: 'Class Reminder',
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
