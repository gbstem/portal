import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { recordSlotRequest } from '$lib/server/interviewSlots'
import { renderEmail } from '$lib/emails/render'
import { formatDateInGbstemTime } from '$lib/utils'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const slotRequestSchema = z.object({
  // The applicant's picked `YYYY-MM-DDTHH:mm`, which names the document.
  requestedTime: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Please select a date and time.'),
  // The same moment as an instant, since only the browser knows its zone.
  date: z.coerce.date(),
})

export type SlotRequestRequestBody = z.input<typeof slotRequestSchema>

export interface SlotRequestResponse {
  /** False when the request was saved but admins couldn't be emailed. */
  emailSent: boolean
}

/**
 * Files an applicant's request for a new interview time and emails admins.
 * The request is saved first: it is what admins work from, so a failed email
 * is logged rather than reported as a failed request.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = slotRequestSchema.parse(await request.json())
    const { firstName } = await recordSlotRequest(
      user.uid,
      body.requestedTime,
      body.date,
    )

    const template = {
      name: 'interviewSlotRequest',
      data: {
        subject: `New Interview Timeslot Request From ${firstName} `,
        app: {
          name: 'Admin',
          link: 'https://admin.gbstem.org',
        },
        interview: {
          firstName,
          timeSlot: formatDateInGbstemTime(body.date, 'long'),
          email: user.email,
          name: 'Portal',
          link: 'https://admin.gbstem.org',
        },
      },
    }

    const htmlBody = renderEmail(
      'interviewRequestedEmailTemplate',
      template.data,
    )

    const response: SlotRequestResponse = { emailSent: true }
    try {
      await sendEmail({
        to: 'admin@gbstem.org',
        cc: 'contact@gbstem.org',
        subject: String(template.data.subject),
        html: htmlBody,
      })
    } catch (mailError) {
      console.error('[API /api/slotRequest] Notification not sent:', mailError)
      response.emailSent = false
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/slotRequest', err)
  }
}
