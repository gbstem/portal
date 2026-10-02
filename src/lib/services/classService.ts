import { errorMessage } from '$lib/shared/apiErrors'
import { db } from '$lib/client/firebase'
import { classesCollection } from '$lib/data/collections'
import type { CoInstructor } from '$lib/helpers/classDetailsForm'
import {
  parseClassInfoDoc,
  sortClassesBySpotsRemaining,
  type ClassInfo,
} from '$lib/helpers/classesPage'
import { accountEmailService } from '$lib/services/accountEmailService'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import type {
  ClassDetailsRequestBody,
  ClassDetailsResponse,
} from '../../routes/api/classDetails/+server'
import type {
  ClassScheduleRequestBody,
  SerializedSchedule,
} from '../../routes/api/classSchedule/+server'
import type {
  FileSubRequestBody,
  SubRequestResponse,
} from '../../routes/api/subRequest/+server'
import type {
  EnrollRequestBody,
  EnrollResponse,
} from '../../routes/api/enroll/+server'
import type { ResolveCoInstructorsRequestBody } from '../../routes/api/resolveCoInstructors/+server'
import type {
  InstructorFeedbackRequestBody,
  InstructorFeedbackResponse,
} from '../../routes/api/instructorFeedback/+server'
import type {
  StudentFeedbackRequestBody,
  StudentFeedbackResponse,
} from '../../routes/api/studentFeedback/+server'

export interface RosterStudent {
  uid: string
  name: string
  email: string
  secondaryEmail: string
  phone: string
  grade: string | number
  school: string
}

/**
 * Service providing Data Access Layer for Class Schedule management.
 */
export const classService = {
  /**
   * Fetches the sanitized student roster for an authorized class via the backend API.
   * Enforces server-side authorization and never exposes sensitive demographics.
   */
  async fetchClassRoster(
    classId: string,
    subRequestId?: string,
  ): Promise<RosterStudent[]> {
    const params = new URLSearchParams({ classId })
    if (subRequestId) {
      params.set('subRequestId', subRequestId)
    }
    const res = await fetch(`/api/classRoster?${params.toString()}`)
    if (!res.ok) {
      throw new Error(
        await errorMessage(
          res,
          `Failed to fetch class roster: ${res.statusText}`,
        ),
      )
    }
    const data = await res.json()
    return data.students || []
  },

  /**
   * Fetches student display names for an authorized class via the backend API.
   */
  async fetchStudentNamesForClass(
    classId: string,
    subRequestId?: string,
  ): Promise<string[]> {
    const roster = await this.fetchClassRoster(classId, subRequestId)
    return roster.map((s) => s.name)
  },

  /**
   * Fetches full details for a single class by ID.
   */
  async fetchClassDetails(classId: string): Promise<Data.Class | null> {
    const snap = await getDoc(doc(db, classesCollection, classId))
    if (!snap.exists()) return null
    return snap.data() as Data.Class
  },

  /**
   * Brings a class's session statuses up to date with the clock, server-side,
   * and returns them - see /api/classSchedule.
   */
  async refreshClassStatuses(classId: string): Promise<string[]> {
    const { classStatuses } = await postClassSchedule<{
      classStatuses: string[]
    }>({ action: 'refreshStatuses', classId })
    return classStatuses
  },

  /**
   * Replaces a class's meeting times. The server carries each kept session's
   * feedback flag and status across and returns the schedule as saved - see
   * /api/classSchedule.
   */
  async rescheduleClass(
    classId: string,
    meetingTimes: Date[],
  ): Promise<{
    meetingTimes: Date[]
    feedbackCompleted: boolean[]
    classStatuses: string[]
  }> {
    const schedule = await postClassSchedule<SerializedSchedule>({
      action: 'reschedule',
      classId,
      meetingTimes,
    })
    return {
      ...schedule,
      meetingTimes: schedule.meetingTimes.map((time) => new Date(time)),
    }
  },

  /**
   * Records that the signed-in instructor is holding today's session of a
   * class, and returns its meeting link. Throws with the server's message
   * when no session is scheduled today - see /api/classSchedule.
   */
  async holdClassSession(classId: string): Promise<{ meetingLink: string }> {
    return postClassSchedule({ action: 'holdSession', classId })
  },

  /**
   * Files a substitute request for one session of a class. Who it names is
   * read from the class server-side - see /api/subRequest. Throws with the
   * server's message on refusal, including when the session already has one.
   */
  async submitSubRequest(body: FileSubRequestBody): Promise<string> {
    const res = await fetch('/api/subRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const response = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        response?.message || 'Failed to send sub request, please try again.',
      )
    }
    return (response as SubRequestResponse).subRequestId
  },

  /**
   * Creates or updates a class from ClassDetailsForm. Ownership, co-instructor
   * eligibility and which dashboards list the class are decided server-side;
   * see /api/classDetails. Throws with the server's message on refusal.
   */
  async saveClassDetails(body: ClassDetailsRequestBody): Promise<void> {
    const res = await fetch('/api/classDetails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(
        await errorMessage(
          res,
          'Could not save class details. Please try again.',
        ),
      )
    }
  },

  /**
   * Gets every class the signed-in instructor can reach: the ones they own
   * and the ones shared with them as a co-instructor.
   * Returns an empty object (rather than throwing) on fetch failure, since
   * callers treat "no accessible classes" and "fetch failed" the same way.
   */
  async fetchInstructorClasses(): Promise<{ [classId: string]: Data.Class }> {
    try {
      const res = await fetch('/api/classDetails')
      if (!res.ok) {
        throw new Error(`Failed to load classes (${res.status})`)
      }
      const { classes } = (await res.json()) as ClassDetailsResponse
      return Object.fromEntries(
        Object.entries(classes).map(([classId, classData]) => [
          classId,
          {
            ...classData,
            meetingTimes: classData.meetingTimes.map((time) => new Date(time)),
            completedClassDates: classData.completedClassDates.map(
              (time) => new Date(time),
            ),
          },
        ]),
      )
    } catch (error) {
      console.error('Error fetching instructor classes:', error)
      return {}
    }
  },

  /**
   * Resolves one co-instructor email to their identity, or an error message
   * explaining why it can't be used.
   *
   * The server is the only side that can answer this: a client can't read
   * another account's uid, `users` document, or decision. See
   * /api/lookupCoInstructor for why every rejection gets the same message.
   */
  async lookupCoInstructor(
    email: string,
  ): Promise<
    { ok: true; coInstructor: CoInstructor } | { ok: false; message: string }
  > {
    try {
      const res = await fetch('/api/lookupCoInstructor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json()
      if (!res.ok) {
        return {
          ok: false,
          message:
            body?.message ||
            'Could not check that email address. Please try again.',
        }
      }
      return { ok: true, coInstructor: body.instructor }
    } catch (error) {
      console.error('Error looking up a co-instructor:', error)
      return {
        ok: false,
        message: 'Could not check that email address. Please try again.',
      }
    }
  },

  /**
   * Expands the `otherInstructorUids` stored on the caller's class `classId`
   * into displayable identities. Uids whose account has been deleted come
   * back omitted; see resolveCoInstructorIdentities on the server. The
   * request is refused unless the caller teaches that class and it lists
   * every one of `uids`.
   *
   * Throws on a transport failure rather than returning [], because callers
   * use the result to decide which stored uids to keep - and silently
   * returning "none of them resolved" would let one failed request wipe a
   * class's co-instructors on the next save.
   */
  async resolveCoInstructors(
    classId: string,
    uids: string[],
  ): Promise<CoInstructor[]> {
    if (uids.length === 0) return []
    const res = await fetch('/api/resolveCoInstructors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classId,
        uids,
      } satisfies ResolveCoInstructorsRequestBody),
    })
    if (!res.ok) {
      throw new Error(`Failed to resolve co-instructors (${res.status})`)
    }
    const { instructors } = (await res.json()) as {
      instructors: CoInstructor[]
    }
    return instructors
  },

  /**
   * The current address of a class's instructor, for the "Contact Instructor"
   * link a parent sees on a class one of their students is enrolled in. Null
   * if the uid names no account. Throws if the request fails, or is refused
   * because none of the signed-in parent's students is on the class roster.
   */
  async fetchEnrolledClassInstructorEmail(
    classId: string,
    instructorUid: string,
  ): Promise<string | null> {
    const emails = await accountEmailService.resolveEmails({
      intent: 'enrolledClassInstructor',
      uids: [instructorUid],
      context: { classId },
    })
    return emails[instructorUid] ?? null
  },

  /**
   * Fetches multiple class documents by ID, silently omitting any that don't exist.
   */
  async fetchClassesByIds(
    classIds: string[],
  ): Promise<(Data.Class & { id: string })[]> {
    const snaps = await Promise.all(
      classIds.map((classId) => getDoc(doc(db, classesCollection, classId))),
    )
    const classes: (Data.Class & { id: string })[] = []
    snaps.forEach((snap) => {
      if (snap.exists()) {
        classes.push({ ...(snap.data() as Data.Class), id: snap.id })
      }
    })
    return classes
  },

  /**
   * Fetches all class offerings, parsed and sorted by spots remaining.
   */
  async fetchAllClassesInfo(): Promise<ClassInfo[]> {
    const querySnapshot = await getDocs(collection(db, classesCollection))
    const rawClasses = querySnapshot.docs.map((classDoc) =>
      parseClassInfoDoc(classDoc.id, classDoc.data()),
    )
    return sortClassesBySpotsRemaining(rawClasses)
  },

  /**
   * Enrolls one of the signed-in parent's students in a class. The class
   * roster and the student's registration are written together in a
   * transaction server-side, where capacity, the two-class limit and grade
   * eligibility are checked too - see /api/enroll. Throws with the server's
   * message on refusal.
   */
  async enrollStudent(
    classId: string,
    studentUid: string,
  ): Promise<EnrollResponse> {
    const payload: EnrollRequestBody = { classId, studentUid }
    const res = await fetch('/api/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(body?.message || 'Error enrolling in class!')
    }
    return body as EnrollResponse
  },

  /**
   * Takes one of the signed-in parent's students out of a class, from both the
   * class roster and their registration in one transaction - see /api/enroll.
   * Throws with the server's message on refusal.
   */
  async unenrollStudent(classId: string, studentUid: string): Promise<void> {
    const payload: EnrollRequestBody = { classId, studentUid }
    const res = await fetch('/api/enroll', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      throw new Error(await errorMessage(res, 'Error unenrolling from class!'))
    }
  },

  /**
   * Records a class instructor's feedback for one session: saves the feedback
   * document and marks the session complete on the class, in one transaction
   * server-side, where the caller is checked against the class - see
   * /api/instructorFeedback. Throws with the server's message on refusal.
   *
   * Only for an instructor of the class - a substitute's feedback goes through
   * /api/substituteFeedback instead.
   */
  async submitInstructorFeedback(
    payload: InstructorFeedbackRequestBody,
  ): Promise<InstructorFeedbackResponse> {
    return postFeedback('/api/instructorFeedback', payload)
  },

  /**
   * Records a parent's weekly feedback on a class one of their students is
   * in. Whose student it is and whether they are in the class are checked
   * server-side - see /api/studentFeedback. Throws with the server's message
   * on refusal.
   */
  async submitStudentFeedback(
    payload: StudentFeedbackRequestBody,
  ): Promise<StudentFeedbackResponse> {
    return postFeedback('/api/studentFeedback', payload)
  },
}

async function postClassSchedule<T>(
  body: ClassScheduleRequestBody,
): Promise<T> {
  const res = await fetch('/api/classSchedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const response = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      response?.message ||
        'Could not update the class schedule. Please try again.',
    )
  }
  return response as T
}

async function postFeedback<T>(route: string, payload: unknown): Promise<T> {
  const res = await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      body?.message || 'Could not save that feedback. Please try again.',
    )
  }
  return body as T
}
