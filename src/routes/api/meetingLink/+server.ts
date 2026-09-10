import { classesCollection, semesterDates } from '$lib/data/collections'
import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { adminDb } from '$lib/server/firebase'
import { isOwnClassId } from '$lib/server/instructorClasses'
import { env } from '$env/dynamic/private'
import { error, json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

// The Entra credentials, preferring the MS_* names.
//
// `$env/dynamic/private` rather than `$env/static/private` because the static
// form inlines at build time and fails the build outright for a name that is
// not set - which is exactly the state Vercel is in while both sets exist.
//
// TODO(remove-vite-fallback): drop the VITE_* half, and this whole block in
// favour of a static import, once the MS_* variables are set in Vercel. The
// old values are in Vercel as secrets nobody can currently read, so they can't
// be copied across yet; the client secret has to be rotated regardless (it was
// reachable by every account that ever signed in via the old /api/token), and
// rotating is the natural moment to set the new names and delete the old ones.
// Every use of a VITE_* value logs `[legacy-vite-env-fallback]`, so the switch
// is done when that line stops appearing - the same signal the API-route
// migration uses for `[legacy-email-fallback]`.
function graphCredentials() {
  const clientId = env.MS_CLIENT_ID || env.VITE_CLIENT_ID
  const clientSecret = env.MS_CLIENT_SECRET || env.VITE_CLIENT_SECRET
  // NOTE: `VITE_TENTANT_ID` is spelled the way the existing Vercel variable is,
  // typo and all. A tenant id is not a secret - it is discoverable from any
  // domain in the tenant through OIDC discovery, and this one sat in this
  // repository's history - so the known value is the last fallback rather than
  // letting a misspelling take the feature down.
  const tenantId =
    env.MS_TENANT_ID ||
    env.VITE_TENTANT_ID ||
    'c9f983d8-6c86-4534-8471-99c48eaab882'
  const calendarUser = env.MS_CALENDAR_USER

  if (!env.MS_CLIENT_ID || !env.MS_CLIENT_SECRET || !env.MS_TENANT_ID) {
    console.warn(
      '[legacy-vite-env-fallback] /api/meetingLink read at least one Entra ' +
        'credential from a VITE_* variable or a built-in default. Set ' +
        'MS_CLIENT_ID, MS_CLIENT_SECRET and MS_TENANT_ID to silence this.',
    )
  }

  if (!clientId || !clientSecret || !calendarUser) {
    // Named individually so a misconfiguration is one glance to diagnose
    // rather than a 500 with nothing behind it.
    const missing = [
      !clientId && 'MS_CLIENT_ID (or VITE_CLIENT_ID)',
      !clientSecret && 'MS_CLIENT_SECRET (or VITE_CLIENT_SECRET)',
      !calendarUser && 'MS_CALENDAR_USER',
    ].filter(Boolean)
    console.error(
      `[API /api/meetingLink] Not configured; missing: ${missing.join(', ')}`,
    )
    throw error(
      503,
      'Meeting links are not configured. Please add your own link, or ask ' +
        'gbSTEM leadership.',
    )
  }

  return { clientId, clientSecret, tenantId, calendarUser }
}

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
 * Deliberately the same test /api/classDetails applies to saving the class,
 * because the link is created *before* the class is saved and there may be no
 * document to check yet:
 *
 *   - an existing class: the caller is its `instructorUid` or one of its
 *     `otherInstructorUids`
 *   - a new class: the id is `${uid}-${n}` under the caller's own uid
 *     (`isOwnClassId`)
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
    return isOwnClassId(classId, uid)
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

async function fetchGraphToken(
  credentials: ReturnType<typeof graphCredentials>,
): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        scope: 'https://graph.microsoft.com/.default',
        client_secret: credentials.clientSecret,
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
    const credentials = graphCredentials()

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

    const token = await fetchGraphToken(credentials)
    const eventRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${credentials.calendarUser}/calendar/events`,
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
