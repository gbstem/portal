import { toDate } from '#lib/shared/timestamps.js'
import {
  applicationsCollection,
  interviewAvailabilityCollection,
  interviewCollection,
  withSemester,
} from '#lib/data/collections.js'
import {
  interviewIneligibility,
  interviewIneligibilityMessages,
  isFinalDecision,
  usableAvailabilityTimes,
} from '#lib/helpers/interviewForm.js'
import { adminDb } from '#lib/server/firebase.js'
import {
  isWithinInterviewWindow,
  type InterviewWindow,
} from '#lib/shared/interviews.js'
import { error } from '@sveltejs/kit'
import type {
  DocumentReference,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore'

/** How far ahead a slot has to be to book it: interviewers need notice. */
const BOOKING_NOTICE_MS = 4 * 60 * 60 * 1000

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

/** A candidate's painted availability, as they see it back. */
export interface SavedAvailability {
  /** ISO strings, soonest first. */
  times: string[]
  /** ISO string. */
  updated: string
}

export interface InterviewData {
  scheduledInterview: ScheduledInterview | null
  /**
   * The times the applicant could book, as ISO strings, soonest first: each
   * once, however many interviewers offer it. Which interviewer is decided
   * when they book, so no name, id or slot leaves the server.
   */
  availableTimes: string[]
  /** The window a booking or painted time must fall in, as ISO strings. */
  interviewWindow: { opens: string; closes: string }
  /** What the applicant painted last, if anything. */
  availability: SavedAvailability | null
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

/** A booking the applicant gave up, with what its interviewer is told. */
export interface ReleasedInterview {
  id: string
  date: Date
  interviewerName: string
  interviewerUid?: string
  /** The applicant's full name, from their profile. */
  intervieweeName: string
}

export interface InterviewCaller {
  uid: string
  email: string
}

/** Whether a slot at `date` can still be booked. */
function isBookable(date: Date, now: Date, window: InterviewWindow): boolean {
  return (
    date.getTime() > now.getTime() + BOOKING_NOTICE_MS &&
    isWithinInterviewWindow(date, window)
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
 * The signed-in applicant's interview for this cycle, if booked; the times
 * they could book: available, far enough ahead, and inside `window`, soonest
 * first; and what they last painted as free.
 *
 * The status and date bounds are filtered in the query itself (see the
 * `interviewSlotStatus`/`date` index in admin's firestore.indexes.json). A
 * slot's id, interviewer and link, and anyone else's booking, never leave the
 * server.
 */
export async function fetchInterviewData(
  uid: string,
  window: InterviewWindow,
): Promise<InterviewData> {
  const now = new Date()
  const availableQuery = adminDb
    .collection(interviewCollection)
    .where('interviewSlotStatus', '==', 'available')
    .where('date', '>', new Date(now.getTime() + BOOKING_NOTICE_MS))
    .where('date', '>=', window.opens)
    .where('date', '<', window.closes)

  const [bookingsSnap, availableSnap, availabilitySnap] = await Promise.all([
    bookingsQuery(uid).get(),
    availableQuery.orderBy('date').get(),
    adminDb.doc(`${interviewAvailabilityCollection}/${uid}`).get(),
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

  const times = new Set(
    availableSnap.docs.map((slot) => toDate(slot.data().date).toISOString()),
  )
  const saved = availabilitySnap.exists ? availabilitySnap.data() : undefined

  return {
    scheduledInterview,
    availableTimes: [...times].sort(),
    interviewWindow: {
      opens: window.opens.toISOString(),
      closes: window.closes.toISOString(),
    },
    availability: saved
      ? {
          times: (saved.times ?? [])
            .map((time: unknown) => toDate(time))
            .filter((time: Date) => time > now)
            .map((time: Date) => time.toISOString())
            .sort(),
          updated: toDate(saved.updated).toISOString(),
        }
      : null,
  }
}

/** The fields that make a slot open again. */
const OPEN_AGAIN = {
  interviewSlotStatus: 'available',
  intervieweeFirstName: '',
  intervieweeLastName: '',
  intervieweeId: '',
}

/**
 * The caller's booking that they may still give up, read inside
 * `transaction`: their current one, booked and not yet started. Refused (409)
 * when they have none, or it has already happened.
 */
async function releasableBooking(
  transaction: Transaction,
  uid: string,
  now: Date,
): Promise<QueryDocumentSnapshot> {
  const bookings = await transaction.get(bookingsQuery(uid))
  const booking = currentBooking(bookings.docs)
  if (!booking || booking.data().interviewSlotStatus !== 'pending') {
    throw error(409, 'You have no interview booked to change.')
  }
  if (toDate(booking.data().date) <= now) {
    throw error(
      409,
      'Your interview time has already come. Please contact gbSTEM to change it.',
    )
  }
  return booking
}

const released = (
  booking: QueryDocumentSnapshot,
  intervieweeName: string,
): ReleasedInterview => ({
  id: booking.id,
  date: toDate(booking.data().date),
  interviewerName: booking.data().interviewerName ?? '',
  interviewerUid: booking.data().interviewerUid || undefined,
  intervieweeName,
})

const fullName = (profile: { firstName?: string; lastName?: string }) =>
  `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim()

/** Refused (409) once the slot is gone or taken: try another interviewer's. */
class SlotTaken extends Error {}

/** Shuffled, so bookings spread across the interviewers offering a time. */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** The result of booking: the new interview, and any given up for it. */
export interface Booking {
  booked: BookedInterview
  /** Set when rescheduling: the booking released in the same transaction. */
  released?: ReleasedInterview
}

/**
 * Books the caller an interview at `date`: one of the slots open at that
 * time, whichever interviewer's is free - the applicant chooses a time, not a
 * person. Each slot is tried in its own transaction, so two applicants
 * choosing the same time at once can't both get one slot; the second gets
 * the next interviewer's, or a refusal when none is left.
 *
 * With `reschedule`, the caller's current booking is given back in the same
 * transaction, so they are never left with two interviews or none. It must
 * still be to come (see releasableBooking).
 *
 * Refused when no slot at that time is open, far enough ahead and inside the
 * interview window, or when the caller doesn't need an interview: no
 * submitted application, an interview already booked or held (unless
 * rescheduling it), or a decision already made (see interviewIneligibility).
 * `meta.interview` says whether they have one, as every slot write sets it in
 * the same transaction, and it is set here too.
 */
export async function bookInterviewTime(
  caller: InterviewCaller,
  date: Date,
  window: InterviewWindow,
  { reschedule = false }: { reschedule?: boolean } = {},
): Promise<Booking> {
  const unavailable = () =>
    error(
      409,
      'That interview time is no longer available. Please choose another.',
    )
  if (!isBookable(date, new Date(), window)) throw unavailable()

  const profile = (await adminDb.doc(`users/${caller.uid}`).get()).data() ?? {}
  const applicationRef = adminDb.doc(`${applicationsCollection}/${caller.uid}`)
  const openAtTime = await adminDb
    .collection(interviewCollection)
    .where('interviewSlotStatus', '==', 'available')
    .where('date', '==', date)
    .get()

  for (const candidate of shuffled(openAtTime.docs)) {
    try {
      return await bookSlot(
        caller,
        candidate.ref,
        applicationRef,
        profile,
        window,
        reschedule,
      )
    } catch (err) {
      if (!(err instanceof SlotTaken)) throw err
    }
  }
  throw unavailable()
}

async function bookSlot(
  caller: InterviewCaller,
  slotRef: DocumentReference,
  applicationRef: DocumentReference,
  profile: { firstName?: string; lastName?: string },
  window: InterviewWindow,
  reschedule: boolean,
): Promise<Booking> {
  return adminDb.runTransaction(async (transaction) => {
    const now = new Date()
    const slotSnap = await transaction.get(slotRef)
    const applicationSnap = await transaction.get(applicationRef)
    const giveUp = reschedule
      ? await releasableBooking(transaction, caller.uid, now)
      : null

    const ineligible = interviewIneligibility(applicationSnap.data()?.meta)
    if (ineligible && !(giveUp && ineligible === 'scheduled')) {
      throw error(
        ineligible === 'unsubmitted' ? 400 : 409,
        interviewIneligibilityMessages[ineligible],
      )
    }

    const slot = slotSnap.exists ? (slotSnap.data() ?? {}) : null
    const date = slot ? toDate(slot.date) : null
    if (
      !slot ||
      !date ||
      slot.interviewSlotStatus !== 'available' ||
      !isBookable(date, now, window)
    ) {
      throw new SlotTaken()
    }

    if (giveUp) transaction.update(giveUp.ref, OPEN_AGAIN)
    transaction.update(slotRef, {
      interviewSlotStatus: 'pending',
      intervieweeFirstName: profile.firstName ?? '',
      intervieweeLastName: profile.lastName ?? '',
      intervieweeId: caller.uid,
    })
    transaction.update(applicationRef, { 'meta.interview': true })

    return {
      booked: {
        id: slotRef.id,
        date,
        interviewerName: slot.interviewerName ?? '',
        interviewerUid: slot.interviewerUid || undefined,
        meetingLink: slot.meetingLink ?? '',
        intervieweeFirstName: profile.firstName ?? '',
      },
      ...(giveUp ? { released: released(giveUp, fullName(profile)) } : {}),
    }
  })
}

/**
 * Cancels the caller's own interview: the slot is open to book again and
 * their application's `meta.interview` is cleared, in one transaction, so
 * they can book another time. Refused (409) when they have no booking still
 * to come, or a decision has already been made.
 */
export async function cancelInterview(
  caller: InterviewCaller,
): Promise<ReleasedInterview> {
  const profile = (await adminDb.doc(`users/${caller.uid}`).get()).data() ?? {}
  const applicationRef = adminDb.doc(`${applicationsCollection}/${caller.uid}`)
  return adminDb.runTransaction(async (transaction) => {
    const applicationSnap = await transaction.get(applicationRef)
    const booking = await releasableBooking(transaction, caller.uid, new Date())
    if (isFinalDecision(applicationSnap.data()?.meta?.decisionType)) {
      throw error(409, interviewIneligibilityMessages.decided)
    }
    transaction.update(booking.ref, OPEN_AGAIN)
    if (applicationSnap.exists) {
      transaction.update(applicationRef, { 'meta.interview': false })
    }
    return released(booking, fullName(profile))
  })
}

/** What saving availability did. */
export interface AvailabilitySave {
  firstName: string
  /** The times kept: to come, in the window, on a row; soonest first. */
  times: Date[]
}

/**
 * Replaces the caller's painted availability with `times`, as one document
 * keyed by their uid, for interviewers to pick from (admin's
 * interviewService.fetchCandidateAvailability). Times already past, outside
 * `window` or off the grid's rows are dropped; saving none clears it.
 *
 * Refused, like a booking, when the caller doesn't need an interview (see
 * interviewIneligibility): no interviewer would see it. The name is read from
 * the caller's own profile, for the admins' notification.
 */
export async function saveAvailability(
  uid: string,
  times: Date[],
  window: InterviewWindow,
  now: Date = new Date(),
): Promise<AvailabilitySave> {
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

  const kept = usableAvailabilityTimes(times, window, now)
  const ref = adminDb.doc(`${interviewAvailabilityCollection}/${uid}`)
  if (kept.length) {
    await ref.set(withSemester({ uid, times: kept, updated: now }))
  } else {
    await ref.delete()
  }
  return { firstName: profileSnap.data()?.firstName ?? '', times: kept }
}
