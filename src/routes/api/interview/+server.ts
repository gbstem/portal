import { interviewScheduledEmailTemplate } from '$lib/data/emailTemplates/interviewScheduledEmailTemplate'
import { sendEmail } from '$lib/server/email'
import { addDataToHtmlTemplate } from '$lib/utils'
import { error, json } from '@sveltejs/kit'
import type { FirebaseError } from 'firebase-admin'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, locals }) => {
  let topError
  try {
    const body = await request.json()
    try {
      const interviewerEmail = body.email
      const interviewDate = body.date
      const interviewLink = body.link
      const interviewerName = body.interviewer
      const intervieweeFirstName = body.firstName
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
            },
          },
        }

        const htmlBody = addDataToHtmlTemplate(
          interviewScheduledEmailTemplate,
          template,
        )

        try {
          await sendEmail({
            to: locals.user.email,
            cc: interviewerEmail,
            subject: String(template.data.subject),
            html: htmlBody,
            replyTo: interviewerEmail,
          })
        } catch (mailError) {
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
