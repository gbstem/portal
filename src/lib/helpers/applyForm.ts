import type {} from '../../data.d.ts'
import { cloneDeep } from 'lodash-es'
import type { ApplicationRequestBody } from '../../routes/api/application/+server'
import { getApplyFormDefaults } from '../components/forms/schemas'

/**
 * Returns clean default empty Data.Application state.
 */
export function createEmptyApplication(): Data.Application {
  const defaults = getApplyFormDefaults()
  return {
    personal: {
      email: '',
      firstName: '',
      lastName: '',
      ...defaults.personal,
    },
    academic: {
      ...defaults.academic,
      graduationYear: '',
    },
    program: {
      ...defaults.program,
    },
    essay: {
      ...defaults.essay,
    },
    agreements: {
      ...defaults.agreements,
    },
    meta: {
      uid: '',
      submitted: false,
      interview: false,
      decided: false,
    },
    timestamps: {
      created: null as any,
      updated: null as any,
    },
  }
}

/**
 * Maps a Data.Application object into superform compatible values.
 */
export function toApplyFormValues(v: Data.Application) {
  return {
    personal: {
      phoneNumber: v.personal?.phoneNumber || '',
      dateOfBirth: v.personal?.dateOfBirth || '',
      gender: v.personal?.gender || '',
      race: v.personal?.race || [],
    },
    academic: {
      school: v.academic?.school || '',
      graduationYear: v.academic?.graduationYear || new Date().getFullYear(),
    },
    program: {
      courses: v.program?.courses || [],
      preferences: v.program?.preferences || '',
      timeSlots: v.program?.timeSlots || '',
      notAvailable: v.program?.notAvailable || '',
      inPerson: v.program?.inPerson !== undefined ? v.program.inPerson : false,
      reason: v.program?.reason || '',
    },
    essay: {
      taughtBefore:
        v.essay?.taughtBefore !== undefined ? v.essay.taughtBefore : false,
      academicBackground: v.essay?.academicBackground || '',
      teachingScenario: v.essay?.teachingScenario || '',
      why: v.essay?.why || '',
    },
    agreements: {
      entireProgram:
        v.agreements?.entireProgram !== undefined
          ? v.agreements.entireProgram
          : false,
      timeCommitment:
        v.agreements?.timeCommitment !== undefined
          ? v.agreements.timeCommitment
          : false,
      submitting:
        v.agreements?.submitting !== undefined
          ? v.agreements.submitting
          : false,
    },
  }
}

/**
 * Safely merges raw application data with user profile defaults.
 */
export function normalizeApplicationData(
  data: any,
  userObj?: { email?: string | null; uid?: string | null },
  userProfile?: {
    firstName?: string | null
    lastName?: string | null
  },
): Data.Application {
  const empty = createEmptyApplication()
  const base = data
    ? {
        ...cloneDeep(empty),
        ...cloneDeep(data),
        // Deep-merge meta specifically so a document written before a new
        // meta field existed (e.g. legacy drafts predating meta.decided)
        // still gets that field's default instead of the whole meta object
        // being overwritten wholesale by the flat spread above.
        meta: {
          ...cloneDeep(empty.meta),
          ...(data.meta ? cloneDeep(data.meta) : {}),
        },
      }
    : empty

  if (userObj?.uid) base.meta.uid = userObj.uid
  if (userObj?.email) base.personal.email = userObj.email
  if (userProfile?.firstName) base.personal.firstName = userProfile.firstName
  if (userProfile?.lastName) base.personal.lastName = userProfile.lastName

  return base
}

/**
 * Constructs request payload for /api/application endpoint.
 */
export function buildApplyApiPayload(
  firstName: string,
): ApplicationRequestBody {
  return {
    firstName,
  }
}

/**
 * Fields inside the application document that this form must never write.
 *
 * Nothing inside the schema's own sections is admin-owned here - the whole of
 * `meta` is (`meta.decided`/`meta.interview` are set by admin decision actions),
 * and `applicationOwnedFields` omits `meta` wholesale rather than field by field.
 */
export const APPLICATION_ADMIN_OWNED_FIELDS: string[] = []

/**
 * What `applicationOwnedFields` returns: `meta` is dropped, but every group it
 * does return is complete, since each one spreads the last-loaded values before
 * the form's. Saying so (rather than returning the looser `ApplicationUpdate`)
 * is what lets the bootstrap write combine this with `values` and still be a
 * whole `Data.Application`.
 */
export type OwnedApplicationFields = Omit<Data.Application, 'meta'>

/**
 * The parts of the application document this form owns, ready to be merged in.
 *
 * Every save after the bootstrap write is a `{ merge: true }` write, so what
 * this returns is exactly what reaches Firestore and anything omitted keeps
 * whatever the last writer left. See `registrationOwnedFields` for why this
 * lives here rather than in the component.
 *
 * `meta` is absent on purpose: echoing this form's snapshot of
 * `meta.decided`/`meta.interview` back on every autosave is what used to revert
 * a decision recorded while the applicant had the page open, and
 * `meta.submitted` is written only by the submit handler.
 *
 * No identity re-pin is needed: `toApplyFormValues` deliberately omits
 * `personal.email`/`firstName`/`lastName`, so the spread below leaves the values
 * `normalizeApplicationData` took from the signed-in profile intact.
 *
 * @param timestamp the caller's `serverTimestamp()` sentinel.
 */
export function applicationOwnedFields(
  values: Data.Application,
  formData: any,
  timestamp: any,
): OwnedApplicationFields {
  return {
    personal: { ...values.personal, ...formData.personal },
    academic: { ...values.academic, ...formData.academic },
    program: { ...values.program, ...formData.program },
    essay: { ...values.essay, ...formData.essay },
    agreements: { ...values.agreements, ...formData.agreements },
    timestamps: {
      created: values.timestamps.created || timestamp,
      updated: timestamp,
    },
  }
}
