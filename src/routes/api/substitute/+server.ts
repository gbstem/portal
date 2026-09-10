import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { adminAuth } from '$lib/server/firebase'
import {
  claimSubRequest,
  fetchOpenSubRequests,
  serializeSubRequest,
  type OpenSubRequest,
  type SerializedSubRequest,
} from '$lib/server/substituteRequests'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const substituteSchema = z.object({
  // Everything else the claim and its email need is read from the stored
  // request, not taken from the caller.
  subRequestId: z.string().min(1, 'A substitute request is required'),
})

export type SubstituteRequestBody = z.infer<typeof substituteSchema>

export interface OpenSubRequestsResponse {
  subRequests: OpenSubRequest[]
}

export interface SubstituteClaimResponse {
  subRequest: SerializedSubRequest
}

/**
 * An account's current address, or undefined if the uid names none. A deleted
 * or mistyped uid drops out of the cc rather than failing the send.
 */
async function resolveEmailByUid(uid: string): Promise<string | undefined> {
  try {
    return (await adminAuth.getUser(uid)).email
  } catch (err) {
    console.error(`Failed to resolve an email for uid ${uid}:`, err)
    return undefined
  }
}

/**
 * A session's date for the confirmation email. The server's own time zone
 * means nothing to the people reading it, so this names gbSTEM's.
 */
function formatSessionDate(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  })
}

/**
 * The sessions the signed-in instructor could cover: still needing a
 * substitute, still to come, and asked for by somebody else.
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyInstructor(locals)
    const response: OpenSubRequestsResponse = {
      subRequests: await fetchOpenSubRequests(user.uid),
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/substitute', err)
  }
}

/**
 * Signs the caller up to cover one session (see claimSubRequest), then sends
 * them the confirmation.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const { subRequestId } = substituteSchema.parse(await request.json())
    const claimed = await claimSubRequest(
      { uid: user.uid, email: user.email },
      subRequestId,
    )

    let originalInstructorEmail = claimed.originalInstructorEmail || undefined
    if (claimed.originalInstructorUid) {
      originalInstructorEmail =
        (await resolveEmailByUid(claimed.originalInstructorUid)) ??
        originalInstructorEmail
    } else if (originalInstructorEmail) {
      console.warn(
        `[legacy-email-fallback] /api/substitute: sub request ${subRequestId} ` +
          'has no originalInstructorUid, using its stored original instructor email',
      )
    }

    if (!originalInstructorEmail) {
      return json(
        { error: 'Original instructor email could not be resolved.' },
        { status: 400 },
      )
    }

    // The class's instructor of record is always told a substitute turned up.
    // So is whoever actually asked for the sub, when that is somebody else - a
    // co-instructor's request still names the *class's* instructor. The caller
    // is the substitute and is already the `to`, so they never appear in the
    // cc.
    const ccEmails = [originalInstructorEmail]
    if (claimed.requestedByUid) {
      const requesterEmail = await resolveEmailByUid(claimed.requestedByUid)
      if (
        requesterEmail &&
        requesterEmail !== originalInstructorEmail &&
        requesterEmail !== user.email
      ) {
        ccEmails.push(requesterEmail)
      }
    }

    const emailData = {
      subject: 'Class Substitute Confirmation',
      app: {
        firstName: claimed.subInstructorFirstName,
        course: claimed.course,
        classNumber: claimed.classNumber,
        date: formatSessionDate(claimed.dateOfClass),
        name: 'Portal',
        link: 'https://portal.gbstem.org',
      },
    }

    try {
      await sendEmail({
        to: user.email,
        cc: ccEmails,
        subject: emailData.subject,
        html: renderEmail('substituteClassEmailTemplate', emailData),
        replyTo: originalInstructorEmail,
      })
    } catch (mailError) {
      return json(
        { error: 'Failed to send email. Please try again later.' },
        { status: 500 },
      )
    }

    const response: SubstituteClaimResponse = {
      subRequest: serializeSubRequest(claimed),
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/substitute', err)
  }
}
