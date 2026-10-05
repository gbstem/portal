import { toDate } from '$lib/shared/timestamps'
import { dev } from '$app/environment'
import {
  applicationsCollection,
  interviewCollection,
  interviewTimeRequestsCollection,
  semesterDates,
} from '$lib/data/collections'
import { slotRequestDocId } from '$lib/data/docIds'
import {
  interviewIneligibility,
  interviewIneligibilityMessages,
  validateRequestedInterviewTime,
} from '$lib/helpers/interviewForm'
import { adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

/** How far ahead a slot has to be to book it: interviewers need notice. */
const BOOKING_NOTICE_MS = 4 * 60 * 60 * 1000

/** A slot on the booking list: only what the list shows. */
export interface AvailableInterviewSlot {
  id: string
  /** ISO string. */
  date: string
  interviewerName: string
}

/** The caller's own interview, as the confirmation card shows it. */
export interface ScheduledInterview {
  id: string
  /** ISO string. */
  date: string
  interviewerName: string
  meetingLink: string
  /** `completed` once the interview's date has passed. */
  interviewSlotStatus: string
}

export interface InterviewData {
  scheduledInterview: ScheduledInterview | null
  availableSlots: AvailableInterviewSlot[]
}

/** A slot as booked, with what the confirmation email needs. */
export interface BookedInterview {
  id: string
  date: Date
  interviewerName: string
  interviewerUid?: string
  meetingLink: string
  intervieweeFirstName: string
}

export interface InterviewCaller {
  uid: string
  email: string
}

/** Whether a slot at `date` can still be booked. */
function isBookable(date: Date, now: Date): boolean {
  return (
    date.getTime() > now.getTime() + BOOKING_NOTICE_MS &&
    // Fixture slot dates go stale in dev, so dev skips the orientation cutoff.
    (dev || date < new Date(semesterDates.instructorOrientation))
  )
}

function bookingsQuery(uid: string) {
  return adminDb
    .collection(interviewCollection)
    .where('intervieweeId', '==', uid)
}

/**
 * The caller's booking, if they have one: their latest slot that wasn't
 * missed. A missed one no longer holds their interview - they can book again.
 * Only this semester's slots are queried, so every one is this cycle's.
 */
function currentBooking(
  bookings: QueryDocumentSnapshot[],
): QueryDocumentSnapshot | undefined {
  return bookings
    .filter((booking) => booking.data().interviewSlotStatus !== 'missed')
    .sort(
      (a, b) =>
        toDate(b.data().date).getTime() - toDate(a.data().date).getTime(),
    )[0]
}

/**
 * The signed-in applicant's interview for this cycle, if booked, and the
 * slots they could book: available, far enough ahead, and before instructor
 * orientation, soonest first.
 *
 * The status and date bounds are filtered in the query itself (see the
 * `interviewSlotStatus`/`date` index in admin's firestore.indexes.json). A
 * slot's interviewer email and uid, and anyone else's booking, never leave
 * the server.
 */
export async function fetchInterviewData(uid: string): Promise<InterviewData> {
  const now = new Date()
  let availableQuery = adminDb
    .collection(interviewCollection)
    .where('interviewSlotStatus', '==', 'available')
    .where('date', '>', new Date(now.getTime() + BOOKING_NOTICE_MS))
  if (!dev) {
    availableQuery = availableQuery.where(
      'date',
      '<',
      new Date(semesterDates.instructorOrientation),
    )
  }

  const [bookingsSnap, availableSnap] = await Promise.all([
    bookingsQuery(uid).get(),
    availableQuery.orderBy('date').get(),
  ])

  const booking = currentBooking(bookingsSnap.docs)
  let scheduledInterview: ScheduledInterview | null = null
  if (booking) {
    const data = booking.data()
    const date = toDate(data.date)
    scheduledInterview = {
      id: booking.id,
      date: date.toISOString(),
      interviewerName: data.interviewerName ?? '',
      meetingLink: data.meetingLink ?? '',
      interviewSlotStatus: date < now ? 'completed' : data.interviewSlotStatus,
    }
  }

  return {
    scheduledInterview,
    availableSlots: availableSnap.docs.map((slot) => ({
      id: slot.id,
      date: toDate(slot.data().date).toISOString(),
      interviewerName: slot.data().interviewerName ?? '',
    })),
  }
}

/**
 * Books `slotId` for the caller, in a transaction, so two applicants choosing
 * the same slot at once can't both get it.
 *
 * Refused when the slot is gone, already booked, too soon or past orientation,
 * or when the caller doesn't need an interview: no submitted application,
 * an interview already booked or held, or a decision already made (see
 * interviewIneligibility). `meta.interview` says whether they have one, as
 * every slot write sets it in the same transaction, and it is set here too.
 */
export async function bookInterviewSlot(
  caller: InterviewCaller,
  slotId: string,
): Promise<BookedInterview> {
  const profile = (await adminDb.doc(`users/${caller.uid}`).get()).data() ?? {}
  const slotRef = adminDb.doc(`${interviewCollection}/${slotId}`)
  const applicationRef = adminDb.doc(`${applicationsCollection}/${caller.uid}`)

  return adminDb.runTransaction(async (transaction) => {
    const slotSnap = await transaction.get(slotRef)
    const applicationSnap = await transaction.get(applicationRef)

    const ineligible = interviewIneligibility(applicationSnap.data()?.meta)
    if (ineligible) {
      throw error(
        ineligible === 'unsubmitted' ? 400 : 409,
        interviewIneligibilityMessages[ineligible],
      )
    }
    if (!slotSnap.exists) {
      throw error(
        404,
        'That interview slot no longer exists. Please select another slot.',
      )
    }

    const slot = slotSnap.data() ?? {}
    const date = toDate(slot.date)
    if (
      slot.interviewSlotStatus !== 'available' ||
      !isBookable(date, new Date())
    ) {
      throw error(
        409,
        'The interview slot you selected is no longer available. Please select another slot.',
      )
    }

    transaction.update(slotRef, {
      interviewSlotStatus: 'pending',
      intervieweeFirstName: profile.firstName ?? '',
      intervieweeLastName: profile.lastName ?? '',
      intervieweeId: caller.uid,
    })
    transaction.update(applicationRef, { 'meta.interview': true })

    return {
      id: slotId,
      date,
      interviewerName: slot.interviewerName ?? '',
      interviewerUid: slot.interviewerUid || undefined,
      meetingLink: slot.meetingLink ?? '',
      intervieweeFirstName: profile.firstName ?? '',
    }
  })
}

/**
 * Records an applicant's request for an interview at a time no slot offers,
 * for admins to add a slot for (admin's interviewService.fetchSlotRequests).
 * Returns the applicant's first name, for the notification.
 *
 * `requestedTime` is the `YYYY-MM-DDTHH:mm` the applicant picked, which names
 * the document (see slotRequestDocId); `date` is that same moment as an
 * instant. The name is read from the applicant's own profile, and the time is
 * checked here - the form's own check is a convenience anyone can skip.
 * Skipped in dev, as the form's is: fixture dates go stale. Refused, like a
 * booking, when the applicant doesn't need an interview (see
 * interviewIneligibility): admins would never see the request anyway.
 */
export async function recordSlotRequest(
  uid: string,
  requestedTime: string,
  date: Date,
): Promise<{ firstName: string }> {
  const invalidReason = dev
    ? null
    : validateRequestedInterviewTime(
        date.toISOString(),
        semesterDates.instructorOrientation,
      )
  if (invalidReason) {
    throw error(400, invalidReason)
  }

  const [profileSnap, applicationSnap] = await Promise.all([
    adminDb.doc(`users/${uid}`).get(),
    adminDb.doc(`${applicationsCollection}/${uid}`).get(),
  ])
  const ineligible = interviewIneligibility(applicationSnap.data()?.meta)
  if (ineligible) {
    throw error(
      ineligible === 'unsubmitted' ? 400 : 409,
      interviewIneligibilityMessages[ineligible],
    )
  }

  const profile = profileSnap.data() ?? {}
  const firstName: string = profile.firstName ?? ''
  await adminDb
    .doc(
      `${interviewTimeRequestsCollection}/${slotRequestDocId(uid, requestedTime)}`,
    )
    .set({
      uid,
      firstName,
      lastName: profile.lastName ?? '',
      date,
    })
  return { firstName }
}
