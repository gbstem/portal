import { E2E_INTERVIEWS_END, FIRESTORE_EMULATOR_HOST } from '$app/env/private'
import { handleApiError, verifyInstructor } from '#lib/server/apiHelpers.js'
import { sendEmail } from '#lib/server/email.js'
import { renderEmail } from '#lib/emails/render.js'
import { openableMeetingLink } from '#lib/helpers/meetingLink.js'
import { formatDateInGbstemTime } from '#lib/utils.js'
import { INTERVIEW_DURATION_MINUTES } from '#lib/shared/interviews.js'
import { resolveCurrentInterviewerEmail } from '#lib/server/interviewerIdentity.js'
import {
  bookInterviewTime,
  cancelInterview,
  fetchInterviewData,
  type BookedInterview,
  type InterviewData,
  type ReleasedInterview,
  type ScheduledInterview,
} from '#lib/server/interviewSlots.js'
import { interviewSchedulingWindow } from '#lib/server/semesterWindows.js'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const schedulingWindow = () =>
  interviewSchedulingWindow({ FIRESTORE_EMULATOR_HOST, E2E_INTERVIEWS_END })

const bookingSchema = z.object({
  // The time chosen. Which interviewer's slot it books, and its link, are
  // decided server-side, not taken from the caller.
  date: z.string().datetime({ message: 'Please choose an interview time' }),
  // Give up the caller's current booking for this one, in the same write.
  reschedule: z.boolean().optional(),
})

export type InterviewBookingRequestBody = z.infer<typeof bookingSchema>

export type InterviewDataResponse = InterviewData

export interface InterviewBookingResponse {
  interview: ScheduledInterview
  /** False when the slot was booked but its confirmation email wasn't sent. */
  emailSent: boolean
}

export interface InterviewCancelResponse {
  /** False when the interview was canceled but its interviewer wasn't told. */
  emailSent: boolean
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
      date: formatDateInGbstemTime(booked.date, 'long'),
      link: openableMeetingLink(booked.meetingLink) ?? '',
      duration: INTERVIEW_DURATION_MINUTES,
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
 * Tells `released`'s interviewer that the applicant gave the interview up,
 * copying the applicant. Reports failure rather than throwing: the change is
 * already written.
 */
async function sendWithdrawnNotice(
  applicantEmail: string,
  released: ReleasedInterview,
  rescheduled: boolean,
): Promise<boolean> {
  const interviewerEmail = await resolveCurrentInterviewerEmail(
    released.interviewerUid,
    '/api/interview',
  )
  if (!interviewerEmail) return false
  const subject = `${released.intervieweeName || 'A candidate'} has ${rescheduled ? 'rescheduled' : 'canceled'} their interview`
  try {
    await sendEmail({
      to: interviewerEmail,
      cc: applicantEmail,
      replyTo: applicantEmail,
      subject,
      html: renderEmail('interviewWithdrawnEmailTemplate', {
        subject,
        app: { name: 'Admin', link: 'https://admin.gbstem.org' },
        interview: {
          interviewee: released.intervieweeName,
          name: released.interviewerName,
          date: formatDateInGbstemTime(released.date, 'long'),
          rescheduled,
        },
      }),
    })
    return true
  } catch (err) {
    console.error(
      `[API /api/interview] Failed to tell the interviewer of slot ${released.id}:`,
      err,
    )
    return false
  }
}

/**
 * The signed-in applicant's interview this cycle, if booked, the times they
 * could book, and what they last painted as free. See fetchInterviewData.
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyInstructor(locals)
    const response: InterviewDataResponse = await fetchInterviewData(
      user.uid,
      schedulingWindow(),
    )
    return Response.json(response)
  } catch (err) {
    throw handleApiError('/api/interview', err)
  }
}

/**
 * Books the signed-in applicant an interview at the time they chose (see
 * bookInterviewTime), or with `reschedule` moves their current one there,
 * then sends the confirmation - and, when rescheduling, tells the previous
 * interviewer.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const { date, reschedule } = bookingSchema.parse(await request.json())
    const { booked, released } = await bookInterviewTime(
      { uid: user.uid, email: user.email },
      new Date(date),
      schedulingWindow(),
      { reschedule },
    )

    const [emailSent] = await Promise.all([
      sendBookingConfirmation(user.email, booked),
      released ? sendWithdrawnNotice(user.email, released, true) : true,
    ])
    const response: InterviewBookingResponse = {
      interview: {
        id: booked.id,
        date: booked.date.toISOString(),
        interviewerName: booked.interviewerName,
        meetingLink: booked.meetingLink,
        interviewSlotStatus: 'pending',
      },
      emailSent,
    }
    return Response.json(response)
  } catch (err) {
    throw handleApiError('/api/interview', err)
  }
}

/**
 * Cancels the signed-in applicant's interview (see cancelInterview), which
 * frees them to book again, and tells its interviewer.
 */
export const DELETE: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyInstructor(locals)
    const released = await cancelInterview({
      uid: user.uid,
      email: user.email,
    })
    const response: InterviewCancelResponse = {
      emailSent: await sendWithdrawnNotice(user.email, released, false),
    }
    return Response.json(response)
  } catch (err) {
    throw handleApiError('/api/interview', err)
  }
}
