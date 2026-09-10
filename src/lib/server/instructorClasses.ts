import { classesCollection, withSemester } from '$lib/data/collections'
import {
  canClaimClassOwnership,
  instructorClassMappingDiff,
  scheduleSourceChanged,
} from '$lib/helpers/classDetailsForm'
import { isInstructorOfClass } from '$lib/server/classDirectory'
import { adminDb } from '$lib/server/firebase'
import {
  isAcceptedInstructor,
  isAcceptedInstructorAccount,
  NOT_AN_ACCEPTED_INSTRUCTOR,
} from '$lib/server/instructorDirectory'
import { error } from '@sveltejs/kit'
import { FieldPath, FieldValue } from 'firebase-admin/firestore'

/**
 * The classes each instructor reaches without owning them, keyed by
 * instructor uid: `{ classIds: [...] }`. Only this module reads or writes it -
 * firestore.rules closes it to every client - and every change to a class's
 * `otherInstructorUids` updates it in the same transaction, so the two can't
 * disagree.
 */
export const INSTRUCTOR_CLASSES_COLLECTION = 'instructorClasses'

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
  if (value instanceof Date) return value.toISOString()
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  return String(value)
}

function serializeClass(data: Record<string, any>): SerializedClass {
  return {
    ...data,
    meetingTimes: (data.meetingTimes ?? []).map(toIsoString),
    completedClassDates: (data.completedClassDates ?? []).map(toIsoString),
  } as SerializedClass
}

function mappingRef(uid: string) {
  return adminDb.doc(`${INSTRUCTOR_CLASSES_COLLECTION}/${uid}`)
}

/**
 * Whether `classId` is one of `uid`'s own: exactly `${uid}-${n}` with `n` a
 * positive integer, the shape generateNewClassId produces. Exact rather than a
 * prefix test because uids can contain hyphens - `instructor` must not own
 * `instructor-demo-uid-1`.
 */
export function isOwnClassId(classId: string, uid: string): boolean {
  const escaped = uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}-[1-9]\\d*$`).test(classId)
}

/**
 * Every class this instructor can reach this semester: the ones they own
 * (see `isOwnClassId`) plus the ones shared with them as a co-instructor.
 *
 * Owned classes come from a document-id range query over the caller's own
 * prefix rather than a scan of the whole collection.
 */
export async function fetchInstructorClasses(
  uid: string,
): Promise<Record<string, SerializedClass>> {
  const [mappingSnap, ownedSnap] = await Promise.all([
    mappingRef(uid).get(),
    adminDb
      .collection(classesCollection)
      .where(FieldPath.documentId(), '>=', `${uid}-`)
      .where(FieldPath.documentId(), '<', `${uid}.`)
      .get(),
  ])

  const classes: Record<string, SerializedClass> = {}
  for (const snap of ownedSnap.docs) {
    if (isOwnClassId(snap.id, uid)) {
      classes[snap.id] = serializeClass(snap.data())
    }
  }

  const sharedIds = ((mappingSnap.data()?.classIds ?? []) as string[]).filter(
    (classId) => !(classId in classes),
  )
  if (sharedIds.length > 0) {
    const sharedSnaps = await adminDb.getAll(
      ...sharedIds.map((classId) =>
        adminDb.doc(`${classesCollection}/${classId}`),
      ),
    )
    for (const snap of sharedSnaps) {
      if (snap.exists) {
        classes[snap.id] = serializeClass(snap.data() ?? {})
      }
    }
  }

  return classes
}

/**
 * Creates or updates a class from ClassDetailsForm, and keeps every affected
 * instructor's dashboard in step with it.
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
 *     reported by the client, so the mappings added and revoked are always
 *     the real difference
 *
 * The class write and every mapping write share one transaction.
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
    const { added, removed } = instructorClassMappingDiff(
      stored?.otherInstructorUids ?? [],
      nextUids,
      ownerUid,
    )
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
        instructorEmail: caller.email,
        instructorFirstName: profile.firstName ?? '',
        instructorLastName: profile.lastName ?? '',
      })
    }

    transaction.set(classRef, withSemester(classFields), { merge: true })
    for (const uid of [ownerUid, ...added]) {
      transaction.set(
        mappingRef(uid),
        { classIds: FieldValue.arrayUnion(classId) },
        { merge: true },
      )
    }
    for (const uid of removed) {
      transaction.set(
        mappingRef(uid),
        { classIds: FieldValue.arrayRemove(classId) },
        { merge: true },
      )
    }
  })
}
