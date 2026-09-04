import type {} from '../../data.d.ts'

/**
 * A co-instructor as the app talks about one: a stable uid, plus the
 * display/contact details that have to be looked up fresh every time because
 * they can change out from under a stored copy.
 *
 * Lives here rather than beside the server resolver that produces it so that
 * client code can name the type without importing `$lib/server/*`, which
 * SvelteKit refuses to bundle.
 */
export type CoInstructor = {
  uid: string
  email: string
  firstName: string
  lastName: string
  // Whether this account is *currently* an accepted instructor. Adding a
  // co-instructor requires this; an already-stored one that has since lost it
  // is surfaced to the class owner rather than silently revoked, so the
  // removal is a deliberate act with someone accountable for it.
  accepted: boolean
}

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
    // A copy, not the stored array: the form mutates this on every add and
    // remove, and aliasing it would edit the class snapshot `values` in place
    // and defeat "Cancel changes".
    otherInstructorUids: [...(v.otherInstructorUids ?? [])],
    // Always false, never `v.confirmation`: the acknowledgement is not stored,
    // and re-entering the form has to ask for it again.
    confirmation: false,
  }
}

/**
 * Normalizes a hand-typed email for lookup. Addresses are stored on Firebase
 * Auth lowercased, and a class owner reading one off a roster will not be.
 */
export function normalizeInstructorEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** "Ada Lovelace" for display, falling back to the address when unnamed. */
export function coInstructorDisplayName(coInstructor: CoInstructor): string {
  const name = `${coInstructor.firstName} ${coInstructor.lastName}`.trim()
  return name || coInstructor.email
}

export function coInstructorUids(list: CoInstructor[]): string[] {
  return list.map((coInstructor) => coInstructor.uid)
}

/**
 * Why `candidate` can't join `list`, or null when it can.
 *
 * Eligibility itself is not checked here - the server already refused to
 * resolve an address that doesn't belong to an accepted instructor, and it is
 * the only side that can check it. This covers only what the client knows:
 * the same person twice, or the class owner adding themselves (they are
 * already the instructor, and a self-entry would let a later removal strip
 * their own instructorClasses mapping).
 */
export function coInstructorAddError(
  list: CoInstructor[],
  candidate: CoInstructor,
  ownerUid: string,
): string | null {
  if (candidate.uid === ownerUid) {
    return "You are already this class's instructor."
  }
  if (list.some((coInstructor) => coInstructor.uid === candidate.uid)) {
    return `${coInstructorDisplayName(candidate)} is already a co-instructor for this class.`
  }
  return null
}

export function addCoInstructor(
  list: CoInstructor[],
  candidate: CoInstructor,
): CoInstructor[] {
  if (list.some((coInstructor) => coInstructor.uid === candidate.uid)) {
    return list
  }
  return [...list, candidate]
}

export function removeCoInstructor(
  list: CoInstructor[],
  uid: string,
): CoInstructor[] {
  return list.filter((coInstructor) => coInstructor.uid !== uid)
}

/**
 * Which instructorClasses mappings a save has to add and which to revoke.
 *
 * The owner is excluded from both sides: their mapping is added
 * unconditionally on every save, and they also reach the class through the
 * `${uid}-${n}` class ID prefix, so revoking it would be both wrong and
 * useless. Removing a co-instructor's *mapping* only takes the class off
 * their dashboard; what actually revokes their write access is their uid
 * leaving `otherInstructorUids`, which firestore.rules reads directly.
 */
export function instructorClassMappingDiff(
  previousUids: string[],
  nextUids: string[],
  ownerUid: string,
): { added: string[]; removed: string[] } {
  const previous = new Set(previousUids.filter((uid) => uid !== ownerUid))
  const next = new Set(nextUids.filter((uid) => uid !== ownerUid))
  return {
    added: [...next].filter((uid) => !previous.has(uid)),
    removed: [...previous].filter((uid) => !next.has(uid)),
  }
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
