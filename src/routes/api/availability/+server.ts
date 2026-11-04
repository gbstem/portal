import { E2E_INTERVIEWS_END, FIRESTORE_EMULATOR_HOST } from '$app/env/private'
import { renderEmail } from '#lib/emails/render.js'
import { summarizeAvailability } from '#lib/helpers/interviewForm.js'
import { handleApiError, verifyInstructor } from '#lib/server/apiHelpers.js'
import { sendEmail } from '#lib/server/email.js'
import { saveAvailability } from '#lib/server/interviewSlots.js'
import { interviewSchedulingWindow } from '#lib/server/semesterWindows.js'
import { z } from 'zod'
import type { RequestHandler } from './$types'

// A full-window paint is a few hundred times.
const MAX_TIMES = 1000

const availabilitySchema = z.object({
  // Instants, since only the browser knows the zone the grid was painted in.
  times: z
    .array(z.string().datetime({ message: 'Each time must be an instant' }))
    .max(MAX_TIMES, 'That is more times than one week grid can hold'),
})

export type AvailabilityRequestBody = z.infer<typeof availabilitySchema>

export interface AvailabilityResponse {
  /** The times kept, as ISO strings: past or out-of-window ones are dropped. */
  times: string[]
  /** False when it was saved but admins couldn't be emailed. */
  emailSent: boolean
}

/**
 * Replaces the signed-in applicant's painted availability (see
 * saveAvailability) and emails admins once, with a summary, rather than once
 * per time. The availability is saved first: it is what interviewers pick
 * from, so a failed email is reported rather than failing the save. Clearing
 * it emails nobody.
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const { times } = availabilitySchema.parse(await request.json())
    const saved = await saveAvailability(
      user.uid,
      times.map((time) => new Date(time)),
      interviewSchedulingWindow({
        FIRESTORE_EMULATOR_HOST,
        E2E_INTERVIEWS_END,
      }),
    )

    const response: AvailabilityResponse = {
      times: saved.times.map((time) => time.toISOString()),
      emailSent: true,
    }
    if (saved.times.length) {
      const subject = `Interview Availability From ${saved.firstName}`
      try {
        await sendEmail({
          to: 'admin@gbstem.org',
          cc: 'contact@gbstem.org',
          subject,
          html: renderEmail('interviewRequestedEmailTemplate', {
            subject,
            app: { name: 'Admin', link: 'https://admin.gbstem.org' },
            interview: {
              firstName: saved.firstName,
              email: user.email,
              ...summarizeAvailability(saved.times),
            },
          }),
        })
      } catch (mailError) {
        console.error(
          '[API /api/availability] Notification not sent:',
          mailError,
        )
        response.emailSent = false
      }
    }
    return Response.json(response)
  } catch (err) {
    throw handleApiError('/api/availability', err)
  }
}
