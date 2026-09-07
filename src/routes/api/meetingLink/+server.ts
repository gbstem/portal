import { classesCollection, semesterDates } from '$lib/data/collections'
import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { adminDb } from '$lib/server/firebase'
import {
  MS_CLIENT_ID,
  MS_CLIENT_SECRET,
  MS_TENANT_ID,
  MS_CALENDAR_USER,
} from '$env/static/private'
import { error, json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const meetingLinkSchema = z.object({
  // The class the link is for. A class being created doesn't exist in
  // Firestore yet, which is why this can't simply require the document -
  // see `callerMayCreateLinkFor`.
  classId: z.string().min(1, 'Class is required'),
  course: z.string().min(1, 'Course is required'),
  classDay1: z.string().min(1, 'At least one class day is required'),
  classDay2: z.string().default(''),
})

export type MeetingLinkRequestBody = z.infer<typeof meetingLinkSchema>

/**
 * Whether this caller is entitled to put a Teams meeting on gbSTEM's calendar
 * for this class.
 *
 * Deliberately the same test `firestore.rules` applies to the class document
 * itself, because the link is created *before* the class is saved and there
 * may be no document to check yet:
 *
 *   - an existing class: the caller is its `instructorUid` or one of its
 *     `otherInstructorUids` (rules' `isInstructorOfClass`)
 *   - a new class: the id is `${uid}-${n}` and the uid is the caller's
 *     (rules' `isInstructorOwnerOrAdmin`, via `belongsToSameUser`)
 *
 * Anything else is refused. Without this an endpoint that books time on a
 * real gbSTEM mailbox would be reachable by every instructor for every class,
 * which is how the `/api/token` route this replaces behaved - except that one
 * handed the caller the raw Graph application token and so was reachable by
 * anyone with an account at all.
 */
async function callerMayCreateLinkFor(
  uid: string,
  classId: string,
): Promise<boolean> {
  const snap = await adminDb.doc(`${classesCollection}/${classId}`).get()
  if (!snap.exists) {
    return classId.startsWith(`${uid}-`)
  }
  const data = snap.data() ?? {}
  return (
    data.instructorUid === uid ||
    (Array.isArray(data.otherInstructorUids) &&
      data.otherInstructorUids.includes(uid))
  )
}

/** Formats a date as Graph's all-day `YYYY-MM-DD` recurrence start. */
function formatIntlDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return [date.getFullYear(), month, day].join('-')
}

async function fetchGraphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: MS_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }).toString(),
    },
  )
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    console.error('[API /api/meetingLink] Graph token request failed:', data)
    throw error(502, 'Could not reach Microsoft Teams. Please try again later.')
  }
  return data.access_token
}

/**
 * Creates the recurring Teams meeting for a class and returns only its join
 * URL.
 *
 * The Graph token is a *client-credentials* token: it carries the whole app
 * registration's application permissions across the tenant, not the caller's.
 * It must never leave the server - the route this replaced returned it to the
 * browser, so any signed-in account (email verification isn't required for a
 * session) could lift it and call Graph directly.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = meetingLinkSchema.parse(await request.json())

    if (!(await callerMayCreateLinkFor(user.uid, body.classId))) {
      throw error(403, 'You do not teach that class.')
    }

    const daysOfWeek = [body.classDay1]
    if (body.classDay2) {
      daysOfWeek.push(body.classDay2)
    }

    const now = new Date().toISOString()
    const event = {
      subject: `${body.course} Class Meeting`,
      body: {
        contentType: 'HTML',
        content: `${body.course} Class Meeting`,
      },
      start: { dateTime: now, timeZone: 'UTC' },
      end: { dateTime: now, timeZone: 'UTC' },
      recurrence: {
        pattern: {
          type: 'weekly',
          interval: 1,
          daysOfWeek,
        },
        range: {
          type: 'numbered',
          startDate: formatIntlDate(new Date(semesterDates.classesStart)),
          numberOfOccurrences: 100,
        },
      },
      location: { displayName: 'Online' },
      attendees: [],
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    }

    const token = await fetchGraphToken()
    const eventRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${MS_CALENDAR_USER}/calendar/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      },
    )
    const eventData = await eventRes.json()
    const joinUrl = eventData?.onlineMeeting?.joinUrl
    if (!eventRes.ok || !joinUrl) {
      console.error('[API /api/meetingLink] Graph event failed:', eventData)
      throw error(502, 'Could not create the meeting. Please try again later.')
    }

    return json({ joinUrl })
  } catch (err) {
    throw handleApiError('/api/meetingLink', err)
  }
}
