import type {} from '../../data.d.ts'
import { cloneDeep } from 'lodash-es'
import type { RegistrationRequestBody } from '../../routes/api/registration/+server'
import { getRegistrationFormDefaults } from '../components/forms/schemas'

/**
 * Returns default empty Data.Registration structure.
 */
export function createEmptyRegistration(): Data.Registration {
  const defaults = getRegistrationFormDefaults()
  return {
    personal: {
      ...defaults.personal,
      parentFirstName: '',
      parentLastName: '',
    },
    academic: {
      ...defaults.academic,
    },
    program: {
      ...defaults.program,
    },
    inPerson: {
      ...defaults.inPerson,
    },
    agreements: {
      ...defaults.agreements,
    },
    meta: {
      uid: '',
      submitted: false,
    },
    timestamps: {
      created: null as any,
      updated: null as any,
    },
  }
}

/**
 * Safely merges incoming Firestore registration data with clean default structure.
 */
export function normalizeRegistrationData(data: any): Data.Registration {
  const empty = createEmptyRegistration()
  if (!data) return empty

  return {
    ...cloneDeep(empty),
    ...cloneDeep(data),
    personal: {
      ...cloneDeep(empty.personal),
      ...(data.personal ? cloneDeep(data.personal) : {}),
    },
    academic: {
      ...cloneDeep(empty.academic),
      ...(data.academic ? cloneDeep(data.academic) : {}),
    },
    program: {
      ...cloneDeep(empty.program),
      ...(data.program ? cloneDeep(data.program) : {}),
    },
    inPerson: {
      ...cloneDeep(empty.inPerson),
      ...(data.inPerson ? cloneDeep(data.inPerson) : {}),
    },
    agreements: {
      ...cloneDeep(empty.agreements),
      ...(data.agreements ? cloneDeep(data.agreements) : {}),
    },
    meta: {
      ...cloneDeep(empty.meta),
      ...(data.meta ? cloneDeep(data.meta) : {}),
    },
  }
}

/**
 * Maps a Data.Registration object into superform compatible values.
 */
export function toRegistrationFormValues(v: Data.Registration) {
  return {
    personal: {
      studentFirstName: v.personal?.studentFirstName || '',
      studentLastName: v.personal?.studentLastName || '',
      parentFirstName: v.personal?.parentFirstName || '',
      parentLastName: v.personal?.parentLastName || '',
      email: v.personal?.email || '',
      secondaryEmail: v.personal?.secondaryEmail || '',
      phoneNumber: v.personal?.phoneNumber || '',
      dateOfBirth: v.personal?.dateOfBirth || '',
      gender: v.personal?.gender || '',
      race: v.personal?.race || [],
      frlp: v.personal?.frlp || '',
      parentEducation: v.personal?.parentEducation || '',
    },
    academic: {
      school: v.academic?.school || '',
      grade: v.academic?.grade || '',
    },
    program: {
      csCourse: v.program?.csCourse || '',
      mathCourse: v.program?.mathCourse || '',
      engineeringCourse: v.program?.engineeringCourse || '',
      scienceCourse: v.program?.scienceCourse || '',
      inPerson: v.program?.inPerson !== undefined ? v.program.inPerson : false,
      reason: v.program?.reason || '',
    },
    inPerson: {
      allergies: v.inPerson?.allergies || '',
      parentPickup: v.inPerson?.parentPickup || '',
    },
    agreements: {
      mediaRelease:
        v.agreements?.mediaRelease !== undefined
          ? v.agreements.mediaRelease
          : false,
      bypassAgeLimits:
        v.agreements?.bypassAgeLimits !== undefined
          ? v.agreements.bypassAgeLimits
          : false,
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
 * Constructs request payload for /api/registration endpoint.
 */
export function buildRegistrationApiPayload(
  userFirstName: string,
  studentFirstName: string,
  parentOrientationDate: string,
  secondaryEmail: string,
): RegistrationRequestBody {
  return {
    firstName: userFirstName,
    studentName: studentFirstName,
    parentOrientationDate,
    secondaryEmail,
  }
}
