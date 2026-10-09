import { toDateOrNull } from '#lib/shared/timestamps.js'
import { isOwnClassId } from '#lib/data/docIds.js'
import { classesCollection, withSemester } from '#lib/data/collections.js'
import {
  canClaimClassOwnership,
  scheduleSourceChanged,
} from '#lib/helpers/classDetailsForm.js'
import { isInstructorOfClass } from '#lib/server/classDirectory.js'
import { adminDb } from '#lib/server/firebase.js'
import {
  isAcceptedInstructor,
  isAcceptedInstructorAccount,
  NOT_AN_ACCEPTED_INSTRUCTOR,
} from '#lib/server/instructorDirectory.js'
import { error } from '@sveltejs/kit'
import { FieldValue } from 'firebase-admin/firestore'

/** A class as it crosses the wire: its session dates as ISO strings. */
export type SerializedClass = Omit<
  Data.Class,
  'meetingTimes' | 'completedClassDates'
> & {
  meetingTimes: string[]
  completedClassDates: string[]
}

/** The class fields an instructor edits through ClassDetailsForm. */
export type ClassDetailsFields = Pick<
  Data.Class,
  | 'course'
  | 'gradeRecommendation'
  | 'classCap'
  | 'meetingLink'
  | 'classDay1'
  | 'classTime1'
  | 'classDay2'
  | 'classTime2'
  | 'online'
  | 'otherInstructorUids'
>

/** A rebuilt schedule: one entry per session in each array. */
export type ClassScheduleFields = Pick<
  Data.Class,
  'meetingTimes' | 'feedbackCompleted' | 'classStatuses'
>

export interface ClassDetailsCaller {
  uid: string
  email: string
}

function toIsoString(value: unknown): string {
  return toDateOrNull(value)?.toISOString() ?? String(value)
}

function serializeClass(data: Record<string, any>): SerializedClass {
  return {
    ...data,
    meetingTimes: (data.meetingTimes ?? []).map(toIsoString),
    completedClassDates: (data.completedClassDates ?? []).map(toIsoString),
  } as SerializedClass
}

/**
 * Every class this instructor can reach this semester: the ones naming them
 * as `instructorUid` or in `otherInstructorUids`, the same fields
 * `isInstructorOfClass` authorizes their writes on.
 */
export async function fetchInstructorClasses(
  uid: string,
): Promise<Record<string, SerializedClass>> {
  const classes = adminDb.collection(classesCollection)
  const snaps = await Promise.all([
    classes.where('instructorUid', '==', uid).get(),
    classes.where('otherInstructorUids', 'array-contains', uid).get(),
  ])

  const result: Record<string, SerializedClass> = {}
  for (const snap of snaps.flatMap(({ docs }) => docs)) {
    result[snap.id] = serializeClass(snap.data())
  }
  return result
}

/**
 * Creates or updates a class from ClassDetailsForm.
 *
 * Everything that decides *who* a class belongs to is settled here rather than
 * taken from the browser:
 *
 *   - the caller must be an accepted instructor, and either an instructor of
 *     the existing class or creating one under their own id (`isOwnClassId`)
 *   - only the owner (or the creator of a new class) is stamped as
 *     `instructorUid`; a co-instructor's save leaves ownership alone
 *   - a co-instructor uid that wasn't already on the class must belong to an
 *     accepted instructor
 *   - the previous co-instructor list is read from the stored class, not
 *     reported by the client, so the uids checked are the ones really being
 *     added
 */
export async function saveClassDetails(
  caller: ClassDetailsCaller,
  classId: string,
  details: ClassDetailsFields,
  schedule?: ClassScheduleFields,
): Promise<void> {
  if (!(await isAcceptedInstructor(caller.uid))) {
    throw error(403, 'Only accepted instructors can save class details.')
  }

  const profile = (await adminDb.doc(`users/${caller.uid}`).get()).data() ?? {}
  const classRef = adminDb.doc(`${classesCollection}/${classId}`)

  await adminDb.runTransaction(async (transaction) => {
    const classSnap = await transaction.get(classRef)
    const stored = classSnap.exists
      ? (classSnap.data() as Data.Class)
      : undefined

    if (stored) {
      if (!isInstructorOfClass(stored, { uid: caller.uid })) {
        throw error(403, 'You are not an instructor of that class.')
      }
    } else if (!isOwnClassId(classId, caller.uid)) {
      throw error(
        403,
        'New classes can only be created under your own account.',
      )
    }

    const hasStoredSchedule = (stored?.meetingTimes?.length ?? 0) > 0
    if (
      !schedule &&
      (!hasStoredSchedule || scheduleSourceChanged(stored ?? {}, details))
    ) {
      throw error(
        400,
        'Your class days or times changed, so the class schedule has to be rebuilt.',
      )
    }

    const claimsOwnership = canClaimClassOwnership(stored, caller)
    const ownerUid = claimsOwnership ? caller.uid : stored!.instructorUid

    const nextUids = [...new Set(details.otherInstructorUids)].filter(
      (uid) => uid !== ownerUid,
    )
    const previousUids = new Set(stored?.otherInstructorUids ?? [])
    const added = nextUids.filter((uid) => !previousUids.has(uid))
    for (const uid of added) {
      if (!(await isAcceptedInstructorAccount(uid))) {
        throw error(400, NOT_AN_ACCEPTED_INSTRUCTOR)
      }
    }

    const classFields: Record<string, unknown> = {
      course: details.course,
      gradeRecommendation: details.gradeRecommendation,
      classCap: details.classCap,
      meetingLink: details.meetingLink,
      classDay1: details.classDay1,
      classTime1: details.classTime1,
      classDay2: details.classDay2,
      classTime2: details.classTime2,
      online: details.online,
      otherInstructorUids: nextUids,
      // TODO(otherInstructorEmails migration, remove ~2026-12-01): drop this
      // once `yarn backfill:coinstructors --drop-legacy-field` has run against
      // production and no class document carries the field.
      otherInstructorEmails: FieldValue.delete(),
    }
    if (!stored) {
      Object.assign(classFields, {
        students: [],
        completedClassDates: [],
        meetingTimes: [],
        feedbackCompleted: [],
        classStatuses: [],
      })
    }
    if (schedule) {
      Object.assign(classFields, schedule)
    }
    if (claimsOwnership) {
      Object.assign(classFields, {
        instructorUid: caller.uid,
        instructorFirstName: profile.firstName ?? '',
        instructorLastName: profile.lastName ?? '',
      })
    }

    transaction.set(classRef, withSemester(classFields), { merge: true })
  })
}
