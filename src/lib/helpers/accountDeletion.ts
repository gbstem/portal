export interface AccountDeletionPlan {
  canDelete: boolean
  reason: string | null
}

/**
 * Decides whether an instructor account can be deleted.
 *
 * Blocked by still owning or co-owning a class this semester, or by having
 * volunteered to cover a future session (`subInstructorId` on a subRequest
 * with a `dateOfClass` still ahead) - someone is counting on them either
 * way. A subRequest they substituted in the past is left alone: it's a
 * permanent record of covering that session, not something to warn about.
 * Pure and Firestore-agnostic - callers resolve the booleans first.
 */
export function planInstructorAccountDeletion(
  ownsClass: boolean,
  coInstructsClass: boolean,
  hasFutureSubRequest: boolean,
): AccountDeletionPlan {
  if (ownsClass || coInstructsClass) {
    return {
      canDelete: false,
      reason:
        'You are the instructor of one or more classes this semester. Please arrange for someone else to take over before deleting your account.',
    }
  }
  if (hasFutureSubRequest) {
    return {
      canDelete: false,
      reason:
        "You've volunteered to substitute for a class coming up this semester. Please withdraw before deleting your account.",
    }
  }
  return { canDelete: true, reason: null }
}

/** One child registration as far as the account-deletion check needs. */
export interface RegistrationForDeletion {
  id: string
  enrolled?: boolean
  classes?: string[]
}

/**
 * Decides whether a student (parent) account can be deleted: blocked if any
 * of their children is enrolled in a class this semester. Checks both
 * `enrolled` and `classes.length` since either alone is enough to mean "in
 * a class" - `enrollStudent`/`unenrollStudent` keep them in step, but this
 * doesn't assume that never drifts.
 */
export function planStudentAccountDeletion(
  registrations: RegistrationForDeletion[],
): AccountDeletionPlan {
  const enrolled = registrations.some(
    (registration) =>
      registration.enrolled === true || (registration.classes?.length ?? 0) > 0,
  )
  if (enrolled) {
    return {
      canDelete: false,
      reason:
        'One or more of your children are enrolled in a class this semester. Please unenroll them before deleting your account.',
    }
  }
  return { canDelete: true, reason: null }
}
