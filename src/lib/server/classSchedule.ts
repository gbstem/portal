import { toDate } from '$lib/shared/timestamps'
import { ClassStatus } from '$lib/components/helpers/ClassStatus'
import { classesCollection } from '$lib/data/collections'
import {
  computeUpdatedClassStatuses,
  findTodaysSessionIndex,
  heldEarlierToday,
  rescheduleSessions,
} from '$lib/helpers/classSchedule'
import { isInstructorOfClass } from '$lib/server/classDirectory'
import { adminDb } from '$lib/server/firebase'
import { isAcceptedInstructor } from '$lib/server/instructorDirectory'
import { GBSTEM_TIME_ZONE } from '$lib/utils'
import { error } from '@sveltejs/kit'
import type { DocumentReference, Transaction } from 'firebase-admin/firestore'

export interface ScheduleCaller {
  uid: string
}

/** A class's per-session arrays as they cross the wire. */
export interface SerializedSchedule {
  meetingTimes: string[]
  feedbackCompleted: boolean[]
  classStatuses: string[]
}

export const NO_SESSION_TODAY =
  'No class session found today! Please update your class schedule if you are planning to hold class today.'

/**
 * Runs `fn` in a transaction on class `classId`, once the caller is known to
 * be allowed to change its schedule: an accepted instructor who owns or
 * co-teaches it - the same test fileInstructorFeedback applies. A substitute
 * is neither, and records their session through recordSubstituteSession.
 *
 * The class is read inside the transaction, so a session a co-instructor or
 * substitute recorded in the meantime is never overwritten with a stale copy.
 */
async function withTaughtClass<T>(
  caller: ScheduleCaller,
  classId: string,
  fn: (
    transaction: Transaction,
    classRef: DocumentReference,
    classData: Data.Class,
  ) => T,
): Promise<T> {
  if (!(await isAcceptedInstructor(caller.uid))) {
    throw error(403, 'Only accepted instructors can change a class schedule.')
  }
  const classRef = adminDb.doc(`${classesCollection}/${classId}`)
  return adminDb.runTransaction(async (transaction) => {
    const classSnap = await transaction.get(classRef)
    if (!classSnap.exists) {
      throw error(404, 'That class no longer exists.')
    }
    const classData = classSnap.data() as Data.Class
    // Uid only: no role is passed, so classDirectory's admin exception can't
    // apply.
    if (!isInstructorOfClass(classData, { uid: caller.uid })) {
      throw error(403, 'You are not an instructor of that class.')
    }
    return fn(transaction, classRef, classData)
  })
}

/**
 * Brings the class's session statuses up to date with the clock - sessions
 * that have passed become "not held" or "complete", and one starting within
 * the half hour "upcoming" - and saves them if anything changed. Returns the
 * statuses either way.
 *
 * The schedule view asks for this whenever it shows a class, which is what
 * keeps admin's class overview current.
 */
export async function refreshClassStatuses(
  caller: ScheduleCaller,
  classId: string,
  now: Date = new Date(),
): Promise<string[]> {
  return withTaughtClass(caller, classId, (transaction, classRef, klass) => {
    const { updatedStatuses, hasChanged } = computeUpdatedClassStatuses(
      klass.classStatuses ?? [],
      klass.feedbackCompleted ?? [],
      (klass.meetingTimes ?? []).map(toDate),
      now,
    )
    if (hasChanged) {
      transaction.update(classRef, { classStatuses: updatedStatuses })
    }
    return updatedStatuses
  })
}

/**
 * Replaces the class's meeting times with `meetingTimes`, carrying each kept
 * session's feedback flag and status across (see rescheduleSessions). Only
 * the times come from the caller; the per-session arrays are worked out here,
 * from the class as stored.
 *
 * Times are matched to the minute, the precision the schedule's inputs
 * offer, so a stored time with stray seconds still counts as unchanged.
 */
export async function rescheduleClass(
  caller: ScheduleCaller,
  classId: string,
  meetingTimes: Date[],
): Promise<SerializedSchedule> {
  const toMinute = (date: Date) => `${date.toISOString().slice(0, 16)}Z`
  return withTaughtClass(caller, classId, (transaction, classRef, klass) => {
    const { sortedEditedTimes, newFeedback, newClassStatuses } =
      rescheduleSessions(
        (klass.meetingTimes ?? []).map((time) => toMinute(toDate(time))),
        meetingTimes.map(toMinute),
        klass.feedbackCompleted ?? [],
        klass.classStatuses ?? [],
      )
    const schedule = {
      meetingTimes: sortedEditedTimes.map((time) => new Date(time)),
      feedbackCompleted: newFeedback,
      classStatuses: newClassStatuses,
    }
    transaction.update(classRef, schedule)
    return {
      ...schedule,
      meetingTimes: schedule.meetingTimes.map((time) => time.toISOString()),
    }
  })
}

/**
 * Records that the class's instructor is holding today's session: stamps the
 * time it was held (once a day) and marks the session held - complete if its
 * feedback is already in, otherwise awaiting feedback. Returns the class's
 * meeting link, read from the class rather than from the caller.
 *
 * "Today" is gbSTEM's calendar day, not the server's. Refused with a 400 when
 * no session falls on it.
 */
export async function holdClassSession(
  caller: ScheduleCaller,
  classId: string,
  now: Date = new Date(),
): Promise<{ meetingLink: string }> {
  return withTaughtClass(caller, classId, (transaction, classRef, klass) => {
    const meetingTimes = (klass.meetingTimes ?? []).map(toDate)
    const index = findTodaysSessionIndex(meetingTimes, now, GBSTEM_TIME_ZONE)
    if (index === -1) {
      throw error(400, NO_SESSION_TODAY)
    }

    const completedClassDates = (klass.completedClassDates ?? []).map(toDate)
    if (!heldEarlierToday(completedClassDates, now, GBSTEM_TIME_ZONE)) {
      completedClassDates.push(now)
    }
    // Padded rather than refused when short: an instructor about to teach
    // shouldn't be turned away over an array written out of step years ago.
    const classStatuses = [...(klass.classStatuses ?? [])]
    while (classStatuses.length < meetingTimes.length) {
      classStatuses.push(ClassStatus.ClassInFuture)
    }
    classStatuses[index] = klass.feedbackCompleted?.[index]
      ? ClassStatus.EverythingComplete
      : ClassStatus.FeedbackIncomplete

    transaction.update(classRef, { completedClassDates, classStatuses })
    return { meetingLink: klass.meetingLink ?? '' }
  })
}
