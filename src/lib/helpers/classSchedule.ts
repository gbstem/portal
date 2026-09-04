import { ClassStatus } from '$lib/components/helpers/ClassStatus'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import generateMeetingTimeChangeEmail from '$lib/components/helpers/generateMeetingTimeChangeEmail'
import type Student from '$lib/components/types/Student'
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
    if (
      now > meetingDate &&
      classStatus !== ClassStatus.EverythingComplete &&
      classStatus !== ClassStatus.FeedbackIncomplete
    ) {
      return feedbackCompleted[index]
        ? ClassStatus.EverythingComplete
        : ClassStatus.ClassNotHeld
    } else if (isClassUpcoming(meetingDate)) {
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
 * Computes updated meeting times, feedback array, and status array when meeting times are edited.
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
  const emailHtmlContent = generateMeetingTimeChangeEmail(
    originalMeetingTimes,
    editedMeetingTimes,
  )

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

  // Update feedback and classStatuses arrays for deleted times
  removed.forEach((index) => {
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
    emailHtmlContent,
  }
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
 * Normalizes student document data from Firestore into a Student object.
 */
export function transformStudentDocData(data: any): Student | null {
  if (!data || !data.personal) return null
  return {
    name: `${data.personal.studentFirstName ?? ''} ${data.personal.studentLastName ?? ''}`.trim(),
    email: data.personal.email ?? '',
    secondaryEmail: data.personal.secondaryEmail ?? '',
    phone: data.personal.phoneNumber ?? '',
    grade: data.academic?.grade ?? '',
    school: data.academic?.school ?? '',
  }
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
  instructorEmail: string
  instructorUid?: string
  meetingLink: string
}): Data.SubRequest {
  // New sub requests will have an instructorUid, but legacy ones may not, and in that case
  // we parse it out of the ${instructorUid}-${classSequenceNumber} format document ID.
  const originalInstructorUid =
    params.instructorUid ||
    (params.classId.includes('-') ? params.classId.replace(/-\d+$/, '') : '')
  return {
    id: params.classId,
    classNumber: params.subRequestClassNumber,
    dateOfClass: new Date(params.subRequestDate),
    notes: params.subRequestNotes,
    course: params.course,
    originalInstructorEmail: params.instructorEmail,
    originalInstructorUid,
    subInstructorFirstName: '',
    subInstructorEmail: '',
    subInstructorId: '',
    subRequestStatus: SubRequestStatus.SubstituteNeeded,
    link: params.meetingLink,
  }
}
