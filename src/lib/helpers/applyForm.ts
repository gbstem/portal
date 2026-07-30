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
      id: '',
      uid: '',
      submitted: false,
      interview: false,
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
    id?: string | null
  },
): Data.Application {
  const empty = createEmptyApplication()
  const base = data ? { ...cloneDeep(empty), ...cloneDeep(data) } : empty

  if (userObj?.uid) base.meta.uid = userObj.uid
  if (userProfile?.id) base.meta.id = userProfile.id
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
