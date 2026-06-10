import { classReminderEmailTemplate } from '$lib/data/emailTemplates/classReminderEmailTemplate'
import { verifyAuthenticated, handleApiError } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { addDataToHtmlTemplate } from '$lib/utils'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export interface RemindStudentsRequestBody {
  email: string
  otherInstructorEmails: string
  name: string
  class: string
  classTime: string
  instructorName: string
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAuthenticated(locals)
    const body = (await request.json()) as RemindStudentsRequestBody

    const email = body.email
    const otherInstructorEmails = body.otherInstructorEmails

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

    const htmlBody = addDataToHtmlTemplate(classReminderEmailTemplate, template)

    try {
      await sendEmail({
        to: email,
        cc: otherInstructorEmails,
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
  } catch (err) {
    throw handleApiError(err)
  }
}
