import { verifyAuthenticated, handleApiError } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { resolveCurrentInterviewerEmail } from '$lib/server/interviewerIdentity'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

// `email` is legacy: the current client sends interviewerUid only, and this
// exists solely so a browser session loaded before the uid migration keeps
// working until it ages out. Every use is logged as `[legacy-email-fallback]`;
// once that counter has read zero for several days, make interviewerUid
// required and delete it - see notes/EMAIL_TO_UID_AUDIT.md section 7, Phase 4.
const interviewSchema = z
  .object({
    email: z.string().email('Invalid interviewer email address').optional(),
    interviewerUid: z.string().optional(),
    date: z.string().min(1, 'Date is required'),
    link: z.string().min(1, 'Meeting link is required'),
    interviewer: z.string().min(1, 'Interviewer name is required'),
    firstName: z.string().min(1, 'First name is required'),
  })
  .refine((data) => Boolean(data.interviewerUid || data.email), {
    message: 'Either interviewerUid or email is required',
    path: ['interviewerUid'],
  })

export type InterviewRequestBody = z.infer<typeof interviewSchema>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyAuthenticated(locals)
    const body = interviewSchema.parse(await request.json())

    const interviewerEmail = await resolveCurrentInterviewerEmail(
      body.interviewerUid,
      body.email,
      '/api/interview',
    )
    if (!interviewerEmail) {
      return json(
        { error: 'Interviewer email could not be resolved' },
        { status: 400 },
      )
    }
    const interviewDate = body.date
    const interviewLink = body.link
    const interviewerName = body.interviewer
    const intervieweeFirstName = body.firstName

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

    const htmlBody = renderEmail(
      'interviewScheduledEmailTemplate',
      template.data,
    )

    try {
      await sendEmail({
        to: user.email,
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
  } catch (err) {
    throw handleApiError('/api/interview', err)
  }
}
