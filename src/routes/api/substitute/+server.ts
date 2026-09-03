import { handleApiError, verifyAuthenticated } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export interface SubstituteRequestBody {
  subInstructorEmail: string
  originalInstructorEmail: string
  firstName: string
  course: string
  classNumber: string | number
  date: string
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAuthenticated(locals)
    const body = (await request.json()) as SubstituteRequestBody

    const subInstructorEmail = body.subInstructorEmail
    const originalInstructorEmail = body.originalInstructorEmail

    const template = {
      name: 'interviewSlotRequest',
      data: {
        subject: 'Class Substitute Confirmation',
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

    const htmlBody = renderEmail('substituteClassEmailTemplate', template.data)

    try {
      await sendEmail({
        to: subInstructorEmail,
        cc: originalInstructorEmail,
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
    throw handleApiError('/api/substitute', err)
  }
}
