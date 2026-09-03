import type {} from '../../data.d.ts'

/**
 * Returns default empty Data.Class structure.
 */
export function getDefaultClassValues(): Data.Class {
  return {
    classDay1: '',
    classTime1: '',
    classDay2: '',
    classTime2: '',
    meetingLink: '',
    gradeRecommendation: '',
    course: '',
    meetingTimes: [],
    completedClassDates: [],
    feedbackCompleted: [],
    classStatuses: [],
    instructorFirstName: '',
    instructorLastName: '',
    instructorEmail: '',
    instructorUid: '',
    otherInstructorEmails: '',
    otherInstructorUids: [],
    classCap: 7,
    online: true,
    students: [],
  }
}

/**
 * Maps a Data.Class object into superform compatible values.
 */
export function toFormValues(v: Data.Class) {
  return {
    course: v.course || '',
    gradeRecommendation: v.gradeRecommendation || '',
    classCap: v.classCap || 7,
    meetingLink: v.meetingLink || '',
    classDay1: (v.classDay1 as any) || '',
    classTime1: v.classTime1 || '',
    classDay2: (v.classDay2 as any) || '',
    classTime2: v.classTime2 || '',
    online: v.online !== undefined ? v.online : true,
    otherInstructorEmails: v.otherInstructorEmails || '',
    // Always false, never `v.confirmation`: the acknowledgement is not stored,
    // and re-entering the form has to ask for it again.
    confirmation: false,
  }
}

/**
 * Normalizes comma/space separated instructor email list.
 */
export function normalizeOtherInstructorEmails(raw: string): string {
  if (!raw) return ''
  return raw
    .split(/[\s,]+/)
    .map((email: string) => email.trim().toLowerCase())
    .filter((email: string) => email.length > 0)
    .join(', ')
}

/**
 * Splits an already-`normalizeOtherInstructorEmails`-normalized string back
 * into individual addresses, for resolving each against
 * /api/resolveInstructorUids.
 */
export function parseOtherInstructorEmails(normalized: string): string[] {
  if (!normalized) return []
  return normalized.split(', ')
}

/**
 * Parses time string (e.g. "4:00 PM") and sets hour/minute on a copy of the base date.
 */
export function parseTime(timeStr: string, date: Date): Date {
  const result = new Date(date.getTime())
  if (!timeStr) return result

  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return result

  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3]?.toUpperCase()

  if (period === 'PM' && hours < 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0

  result.setHours(hours, minutes, 0, 0)
  return result
}

/**
 * Generates an array of meeting Dates between startDate and endDate.
 */
export function getMeetingDates(
  classDay1: string,
  classDay2: string,
  classTime1: string,
  classTime2: string,
  startDate: Date,
  endDate: Date,
): Date[] {
  const meetingDates: Date[] = []
  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  }

  const currentDate = new Date(startDate.getTime())
  while (currentDate <= endDate) {
    if (currentDate.getDay() === dayMap[classDay1]) {
      const meetingTime = parseTime(classTime1, currentDate)
      meetingDates.push(new Date(meetingTime))
    }
    if (classDay2 && currentDate.getDay() === dayMap[classDay2]) {
      const meetingTime = parseTime(classTime2, currentDate)
      meetingDates.push(new Date(meetingTime))
    }
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return meetingDates
}

/**
 * Calculates next available class ID for a user given existing class IDs.
 */
export function generateNewClassId(
  existingClassIds: string[],
  userUid: string,
): string {
  const existingNumbers = existingClassIds
    .filter((id) => id.startsWith(`${userUid}-`))
    .map((id) => parseInt(id.split('-')[1], 10))
    .filter((n) => !isNaN(n))

  const classNumber =
    existingNumbers.length > 0
      ? (Math.max(...existingNumbers) + 1).toString()
      : '1'

  return `${userUid}-${classNumber}`
}

/**
 * The class fields the generated schedule is derived from. `getMeetingDates`
 * reads exactly these four and nothing else, so a change to any of them
 * invalidates every meeting date already stored on the class - and a change to
 * any other field leaves the stored schedule perfectly valid.
 */
export const SCHEDULE_SOURCE_FIELDS = [
  'classDay1',
  'classTime1',
  'classDay2',
  'classTime2',
] as const

/**
 * Whether saving `next` over `stored` would produce a different schedule.
 *
 * Both sides are coerced with `|| ''` because an absent field and an empty one
 * mean the same thing here: a class meeting once a week stores `classDay2` as
 * `''`, while a document written before that field existed omits it entirely.
 * Neither should read as a change the instructor has to confirm.
 */
export function scheduleSourceChanged(
  stored: Partial<Data.Class>,
  next: Partial<Data.Class>,
): boolean {
  return SCHEDULE_SOURCE_FIELDS.some(
    (field) => (stored?.[field] || '') !== (next?.[field] || ''),
  )
}
