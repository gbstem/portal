import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { resolveCurrentInterviewerEmail } from '$lib/server/interviewerIdentity'
import {
  bookInterviewSlot,
  fetchInterviewData,
  type BookedInterview,
  type InterviewData,
  type ScheduledInterview,
} from '$lib/server/interviewSlots'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const bookingSchema = z.object({
  // Everything else - the interviewer, the time and the link - is read from
  // the slot, not taken from the caller.
  slotId: z.string().min(1, 'Please select an interview slot'),
})

export type InterviewBookingRequestBody = z.infer<typeof bookingSchema>

export type InterviewDataResponse = InterviewData

export interface InterviewBookingResponse {
  interview: ScheduledInterview
  /** False when the slot was booked but its confirmation email wasn't sent. */
  emailSent: boolean
}

/**
 * An interview's date for the confirmation email. The server's own time zone
 * means nothing to the people reading it, so this names gbSTEM's.
 */
function formatInterviewDate(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: 'America/New_York',
    timeZoneName: 'long',
  })
}

/**
 * Emails the applicant their interview, copying the interviewer at their
 * current address. Reports failure rather than throwing: the slot is already
 * booked by the time this runs.
 */
async function sendBookingConfirmation(
  applicantEmail: string,
  booked: BookedInterview,
): Promise<boolean> {
  const interviewerEmail = await resolveCurrentInterviewerEmail(
    booked.interviewerUid,
    booked.interviewerEmail,
    '/api/interview',
  )
  if (!interviewerEmail) {
    console.error(
      `[API /api/interview] No interviewer email resolved for slot ${booked.id}; its confirmation was not sent.`,
    )
    return false
  }

  const subject = `${booked.intervieweeFirstName}, your interview with ${booked.interviewerName} has been scheduled`
  const html = renderEmail('interviewScheduledEmailTemplate', {
    subject,
    app: {
      name: 'Portal',
      link: 'https://portal.gbstem.org',
    },
    interview: {
      interviewee: booked.intervieweeFirstName,
      name: booked.interviewerName,
      date: formatInterviewDate(booked.date),
      link: booked.meetingLink,
    },
  })

  try {
    await sendEmail({
      to: applicantEmail,
      cc: interviewerEmail,
      subject,
      html,
      replyTo: interviewerEmail,
    })
    return true
  } catch (err) {
    console.error(
      `[API /api/interview] Failed to send the confirmation for slot ${booked.id}:`,
      err,
    )
    return false
  }
}

/**
 * The signed-in applicant's interview this cycle, if booked, and the slots
 * they could book. See fetchInterviewData.
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyInstructor(locals)
    const response: InterviewDataResponse = await fetchInterviewData(user.uid)
    return json(response)
  } catch (err) {
    throw handleApiError('/api/interview', err)
  }
}

/**
 * Books one slot for the signed-in applicant (see bookInterviewSlot), then
 * sends the confirmation.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const { slotId } = bookingSchema.parse(await request.json())
    const booked = await bookInterviewSlot(
      { uid: user.uid, email: user.email },
      slotId,
    )

    const response: InterviewBookingResponse = {
      interview: {
        id: booked.id,
        date: booked.date.toISOString(),
        interviewerName: booked.interviewerName,
        meetingLink: booked.meetingLink,
        interviewSlotStatus: 'pending',
      },
      emailSent: await sendBookingConfirmation(user.email, booked),
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/interview', err)
  }
}
