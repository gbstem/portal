import { verifyAuthenticated, handleApiError } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export interface SlotRequestRequestBody {
  firstName: string
  timeSlot: string
  intervieweeEmail: string
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAuthenticated(locals)
    const body = (await request.json()) as SlotRequestRequestBody

    const template = {
      name: 'interviewSlotRequest',
      data: {
        subject: `New Interview Timeslot Request From ${body.firstName} `,
        app: {
          name: 'Admin',
          link: 'https://admin.gbstem.org',
        },
        interview: {
          firstName: body.firstName,
          timeSlot: body.timeSlot,
          email: body.intervieweeEmail,
          name: 'Portal',
          link: 'https://admin.gbstem.org',
        },
      },
    }

    const htmlBody = renderEmail(
      'interviewRequestedEmailTemplate',
      template.data,
    )

    try {
      await sendEmail({
        to: 'admin@gbstem.org',
        cc: 'contact@gbstem.org',
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
    throw handleApiError('/api/slotRequest', err)
  }
}
