import { parseClassDocId } from '$lib/data/docIds'
import { ClassStatus } from '$lib/components/helpers/ClassStatus'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import generateMeetingTimeChangeEmail from '$lib/components/helpers/generateMeetingTimeChangeEmail'
import { isClassUpcoming } from '$lib/utils'
import type {} from '../../data.d.ts'

/**
 * Computes updated class statuses based on meeting times and feedback completion.
 */
export function computeUpdatedClassStatuses(
  classStatuses: string[],
  feedbackCompleted: boolean[],
  meetingTimes: (Date | string)[],
  now: Date = new Date(),
): { updatedStatuses: string[]; hasChanged: boolean } {
  const originalStatuses = [...classStatuses]
  const paddedStatuses = classStatuses.concat(
    Array(Math.max(0, meetingTimes.length - classStatuses.length)).fill(
      ClassStatus.ClassInFuture,
    ),
  )

  const updateStatuses = (classStatus: string, index: number) => {
    const meetingDate = new Date(meetingTimes[index])
    const held =
      classStatus === ClassStatus.EverythingComplete ||
      classStatus === ClassStatus.FeedbackIncomplete
    if (now > meetingDate && !held) {
      return feedbackCompleted[index]
        ? ClassStatus.EverythingComplete
        : ClassStatus.ClassNotHeld
    } else if (isClassUpcoming(meetingDate) && !held) {
      // A session held a few minutes early is still held: turning it back
      // into "upcoming" let it become "not held" once its start time passed.
      return ClassStatus.ClassUpcomingSoon
    } else if (
      classStatus === ClassStatus.FeedbackIncomplete &&
      feedbackCompleted[index]
    ) {
      return ClassStatus.EverythingComplete
    } else {
      return classStatus
    }
  }

  const updatedStatuses = paddedStatuses.map(updateStatuses)
  const hasChanged =
    updatedStatuses.length !== originalStatuses.length ||
    updatedStatuses.some((st, i) => st !== originalStatuses[i])

  return { updatedStatuses, hasChanged }
}

/**
 * Computes updated meeting times, feedback array, and status array when
 * meeting times are edited, plus the email telling parents what moved.
 */
export function computeMeetingTimeChanges(
  originalMeetingTimes: string[],
  editedMeetingTimes: string[],
  feedbackCompleted: boolean[],
  classStatuses: string[],
): {
  sortedEditedTimes: string[]
  newFeedback: boolean[]
  newClassStatuses: string[]
  emailHtmlContent: string
} {
  return {
    ...rescheduleSessions(
      originalMeetingTimes,
      editedMeetingTimes,
      feedbackCompleted,
      classStatuses,
    ),
    emailHtmlContent: generateMeetingTimeChangeEmail(
      originalMeetingTimes,
      editedMeetingTimes,
    ),
  }
}

/**
 * The class's per-session arrays after its meeting times are edited: sessions
 * that kept their time keep their feedback flag and status, removed ones drop
 * theirs, and added ones start as not yet held. Times are compared as the
 * strings given, so both lists must use the same format.
 *
 * Shared by the schedule view and /api/classSchedule, which is what actually
 * saves the result.
 */
export function rescheduleSessions(
  originalMeetingTimes: string[],
  editedMeetingTimes: string[],
  feedbackCompleted: boolean[],
  classStatuses: string[],
): {
  sortedEditedTimes: string[]
  newFeedback: boolean[]
  newClassStatuses: string[]
} {
  // Sort meeting times chronologically
  const sortedEditedTimes = [...editedMeetingTimes].sort((a, b) => {
    return new Date(a).getTime() - new Date(b).getTime()
  })

  // Deduplicate meeting times
  const uniqueTimes = sortedEditedTimes.filter(
    (time, index) => sortedEditedTimes.indexOf(time) === index,
  )

  // Find removed indices
  const removed: number[] = []
  originalMeetingTimes.forEach((time, index) => {
    if (!uniqueTimes.includes(time)) removed.push(index)
  })

  // Find added indices
  const added: number[] = []
  uniqueTimes.forEach((time, index) => {
    if (!originalMeetingTimes.includes(time)) added.push(index)
  })

  let newFeedback = [...feedbackCompleted]
  let newClassStatuses = [...classStatuses]

  // Update feedback and classStatuses arrays for deleted times, last first:
  // removing an earlier session shifts every later index down by one, so in
  // ascending order a second removal took out the wrong session's entries.
  ;[...removed].reverse().forEach((index) => {
    newFeedback.splice(index, 1)
    newClassStatuses.splice(index, 1)
  })

  // Update feedback and classStatuses arrays for added times
  added.forEach((index) => {
    newFeedback = [
      ...newFeedback.slice(0, index),
      false,
      ...newFeedback.slice(index),
    ]
    newClassStatuses = [
      ...newClassStatuses.slice(0, index),
      ClassStatus.ClassInFuture,
      ...newClassStatuses.slice(index),
    ]
  })

  return {
    sortedEditedTimes: uniqueTimes,
    newFeedback,
    newClassStatuses,
  }
}

/** The calendar day (`YYYY-MM-DD`) and hour (0-23) of `date` in `timeZone`. */
function dayAndHourIn(
  date: Date,
  timeZone: string,
): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  return {
    day: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')),
  }
}

/**
 * The index of the session being held today, or -1 when none is. With two
 * sessions today, it is the first that hasn't started its hour yet - the same
 * choice findNextClassDateIndex makes in the browser, but on `timeZone`'s
 * calendar, since the server's own time zone is not the class's.
 */
export function findTodaysSessionIndex(
  meetingTimes: (Date | string)[],
  now: Date,
  timeZone: string,
): number {
  const today = dayAndHourIn(now, timeZone)
  const todays = meetingTimes
    .map((time, index) => ({
      index,
      ...dayAndHourIn(new Date(time), timeZone),
    }))
    .filter((session) => session.day === today.day)
  if (todays.length <= 1) return todays[0]?.index ?? -1
  return todays.find((session) => session.hour >= today.hour)?.index ?? -1
}

/**
 * Whether a session was already recorded as held earlier today, on
 * `timeZone`'s calendar - the server-side counterpart of `classTodayHeld`.
 */
export function heldEarlierToday(
  completedClassDates: Date[],
  now: Date,
  timeZone: string,
): boolean {
  const today = dayAndHourIn(now, timeZone).day
  return completedClassDates.some(
    (date) => date < now && dayAndHourIn(date, timeZone).day === today,
  )
}

/**
 * Finds the index of the next class date that hasn't passed yet.
 */
export function findNextClassDateIndex(
  meetingTimes: (Date | string)[],
  now: Date = new Date(),
): number {
  const todayString = now.toDateString()
  const todayHour = now.getHours()

  const todayDates = meetingTimes.filter(
    (schedule) => new Date(schedule).toDateString() === todayString,
  )

  if (todayDates.length === 1) {
    return meetingTimes.findIndex(
      (schedule) => new Date(schedule).toDateString() === todayString,
    )
  } else if (todayDates.length > 1) {
    const futureTodayClasses = todayDates.filter(
      (classDate) => new Date(classDate).getHours() >= todayHour,
    )
    return futureTodayClasses.length > 0
      ? meetingTimes.findIndex(
          (date) =>
            new Date(date).toDateString() === todayString &&
            new Date(date).getHours() >= todayHour,
        )
      : meetingTimes.findIndex((schedule) => new Date(schedule) > now)
  } else {
    return meetingTimes.findIndex((schedule) => new Date(schedule) > now)
  }
}

/**
 * Every instructor uid on a class - its owner, then its co-instructors, with
 * blanks and duplicates dropped.
 *
 * What the reminder endpoint cc's, minus whoever is sending it. It has to
 * carry the owner as well as `otherInstructorUids`, or a reminder sent by a
 * co-instructor copies their colleagues and not the person whose class it is.
 */
export function classInstructorUids(klass: {
  instructorUid?: string
  otherInstructorUids?: string[]
}): string[] {
  return [
    ...new Set([
      klass.instructorUid ?? '',
      ...(klass.otherInstructorUids ?? []),
    ]),
  ].filter(Boolean)
}

/**
 * Constructs a Data.SubRequest payload.
 */
export function buildSubRequestPayload(params: {
  classId: string
  subRequestClassNumber: number
  subRequestDate: string
  subRequestNotes: string
  course: string
  instructorUid?: string
  // The signed-in instructor, who may be a co-instructor rather than the
  // class's owner. `originalInstructor*` below is the class's instructor of
  // record whoever asks, so without this the request names nobody who can be
  // told a substitute turned up.
  requestedByUid?: string
  meetingLink: string
}): Data.SubRequest {
  // A class without an instructorUid predates the field; its id may still
  // record who created it (see parseClassDocId).
  const originalInstructorUid =
    params.instructorUid ||
    (parseClassDocId(params.classId)?.instructorUid ?? '')
  return {
    id: params.classId,
    classNumber: params.subRequestClassNumber,
    dateOfClass: new Date(params.subRequestDate),
    notes: params.subRequestNotes,
    course: params.course,
    // No address is stored: whoever needs one resolves it from a uid, so it
    // can't go stale when an instructor changes their account email.
    originalInstructorUid,
    requestedByUid: params.requestedByUid ?? originalInstructorUid,
    subInstructorFirstName: '',
    subInstructorId: '',
    subRequestStatus: SubRequestStatus.SubstituteNeeded,
    link: params.meetingLink,
  }
}
