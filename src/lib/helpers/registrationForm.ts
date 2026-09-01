import type {} from '../../data.d.ts'
import { cloneDeep } from 'lodash-es'
import type { RegistrationRequestBody } from '../../routes/api/registration/+server'
import { getRegistrationFormDefaults } from '../components/forms/schemas'
import type { RegistrationUpdate } from '../services/registrationService'

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
 * Builds the registration document for a child slot's very first write.
 *
 * `timestamps.created` is stamped here because this is the only write that sends the
 * whole document: `registrationOwnedFields` fills `created` in only when it is already
 * missing, so a draft bootstrapped with the `null` `createEmptyRegistration` returns kept
 * that null until its parent happened to save again - and kept it forever once submitted,
 * which is what admin's `timestamps.created.toDate()` reads crashed on. The save paths
 * were fixed in portal #61; this one was missed.
 *
 * Note the caller's `serverTimestamp()` sentinel stays in the in-memory copy afterwards
 * (the bootstrap deliberately doesn't re-read the document - see `bootstrapRegistration`).
 * It is truthy, so the next save re-sends it rather than round-tripping a stored value,
 * and `created` lands on that save's server time instead of this one - at most one autosave
 * interval later. That is a bounded imprecision on a server clock, unlike the null it
 * replaces, which was a hard crash.
 *
 * @param timestamp the caller's `serverTimestamp()` sentinel.
 */
export function createBootstrapRegistration(
  childUid: string,
  parentFirstName: string,
  parentLastName: string,
  email: string,
  timestamp: any,
): Data.Registration {
  const values = createEmptyRegistration()
  values.meta.uid = childUid
  values.personal.parentFirstName = parentFirstName
  values.personal.parentLastName = parentLastName
  values.personal.email = email
  values.timestamps.created = timestamp
  values.timestamps.updated = timestamp
  return values
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

/**
 * Fields inside the registration document that this form must never write.
 *
 * `agreements.bypassAgeLimits` is admin-only - it waives the course age check
 * `classService` enforces. The form never renders it, so echoing its page-load
 * value back on every autosave is what used to revoke a waiver granted while
 * the parent had the page open.
 */
export const REGISTRATION_ADMIN_OWNED_FIELDS = ['agreements.bypassAgeLimits']

/**
 * The parts of the registration document this form owns, ready to be merged in.
 *
 * Every save after the bootstrap write is a `{ merge: true }` write, so what
 * this returns is exactly what reaches Firestore and anything omitted keeps
 * whatever the last writer left. That makes this the highest-consequence field
 * list in the form - hence living here, where `formFieldParity.test.ts` can
 * check it against the schema, rather than inside the component.
 *
 * `meta` is absent on purpose: it's written only by the submit handler and by
 * the bootstrap write.
 *
 * @param timestamp the caller's `serverTimestamp()` sentinel.
 */
export function registrationOwnedFields(
  values: Data.Registration,
  formData: any,
  timestamp: any,
): RegistrationUpdate {
  return {
    personal: {
      ...values.personal,
      ...formData.personal,
      // Identity fields belong to the parent's account, not to this form.
      // `initializeForm` writes them from the signed-in profile; re-pin them
      // here so a stale or absent form value can never overwrite them.
      email: values.personal.email,
      parentFirstName: values.personal.parentFirstName,
      parentLastName: values.personal.parentLastName,
    },
    academic: { ...values.academic, ...formData.academic },
    program: { ...values.program, ...formData.program },
    inPerson: { ...values.inPerson, ...formData.inPerson },
    // Enumerated rather than spread so `bypassAgeLimits` can't ride along.
    // A new agreement added to the schema has to be added here too - which is
    // what the parity test enforces.
    agreements: {
      mediaRelease: formData.agreements.mediaRelease,
      entireProgram: formData.agreements.entireProgram,
      timeCommitment: formData.agreements.timeCommitment,
      submitting: formData.agreements.submitting,
    },
    timestamps: {
      created: values.timestamps.created || timestamp,
      updated: timestamp,
    },
  }
}
