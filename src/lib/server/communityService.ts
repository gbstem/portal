import { ClassStatus } from '$lib/components/helpers/ClassStatus'
import { SubRequestStatus } from '$lib/components/helpers/SubRequestStatus'
import { currentSemester } from '$lib/data/collections'
import { adminDb } from '$lib/server/firebase'
import { fetchInstructorClasses } from '$lib/server/instructorClasses'

/**
 * Who signs the confirmation email. Update this when gbSTEM's presidents
 * change.
 */
export const COMMUNITY_SERVICE_SIGNATORIES =
  'Kendree Chen, Dea Pance, and Michael Bolgov'

/** Credited hours per session, including prep time. */
export const HOURS_PER_CLASS_SESSION = 1.25
export const HOURS_PER_SUB_SESSION = 1.5

export interface CommunityServiceSummary {
  /** Sessions of the instructor's own classes that were held. */
  classSessions: number
  /** Sessions the instructor covered as a substitute. */
  subSessions: number
  classHours: number
  subHours: number
  totalHours: number
  /** The courses taught, comma-separated; `''` when none. */
  course: string
  season: 'fall' | 'spring'
  year: number
}

/** `Fall26` -> `{ season: 'fall', year: 2026 }`. */
export function semesterSeasonAndYear(semesterId: string): {
  season: 'fall' | 'spring'
  year: number
} {
  const match = /^(Spring|Fall)(\d\d)$/.exec(semesterId)
  if (!match) {
    throw new Error(`Unrecognized semester id: ${semesterId}`)
  }
  return {
    season: match[1] === 'Fall' ? 'fall' : 'spring',
    year: 2000 + Number(match[2]),
  }
}

/**
 * An instructor's community-service hours, computed from their classes this
 * semester and the substitute sessions they have completed. The confirmation
 * email attests to these figures, so they are read here rather than accepted
 * from the browser.
 */
export async function communityServiceSummary(
  uid: string,
): Promise<CommunityServiceSummary> {
  const [classes, subCount] = await Promise.all([
    fetchInstructorClasses(uid),
    // Substitute sessions count from every semester. A collection-group query,
    // because past semesters' requests are archived under
    // `semesters/{id}/subRequests` (see admin's
    // scripts/archive-past-sub-requests.ts) while the current semester's are
    // top-level.
    adminDb
      .collectionGroup('subRequests')
      .where('subInstructorId', '==', uid)
      .where('subRequestStatus', '==', SubRequestStatus.NoSubstituteNeeded)
      .count()
      .get(),
  ])

  let classSessions = 0
  const courses = new Set<string>()
  for (const data of Object.values(classes)) {
    classSessions += (data.classStatuses ?? []).filter(
      (status) =>
        status === ClassStatus.EverythingComplete ||
        status === ClassStatus.FeedbackIncomplete,
    ).length
    if (data.course) courses.add(data.course)
  }
  const subSessions = subCount.data().count
  const classHours = classSessions * HOURS_PER_CLASS_SESSION
  const subHours = subSessions * HOURS_PER_SUB_SESSION

  return {
    classSessions,
    subSessions,
    classHours,
    subHours,
    totalHours: classHours + subHours,
    course: [...courses].join(', '),
    ...semesterSeasonAndYear(currentSemester),
  }
}
