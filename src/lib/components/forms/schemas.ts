// Zod schemas that we use for input validation across all of our forms, and
// also in seed.ts for ensuring our test data is valid.
import { z } from 'zod'
import {
  isAllowedMeetingLink,
  MEETING_LINK_ERROR,
} from '#lib/helpers/meetingLink.js'

const phoneRegex = /^[\d\s\-+]+$/
const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const classSchema = z.object({
  course: z.string().min(1, 'Course is required'),
  gradeRecommendation: z.string().optional().default(''),
  classCap: z.coerce.number().min(0, 'Capacity must be at least 0'),
  // Empty means "none yet": the form books a Teams link on save, and an
  // in-person class has none. See #lib/helpers/meetingLink.
  meetingLink: z
    .string()
    .trim()
    .refine((link) => link === '' || isAllowedMeetingLink(link), {
      message: MEETING_LINK_ERROR,
    })
    .optional()
    .default(''),
  classDay1: z.enum(
    [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ],
    {
      errorMap: () => ({ message: 'Day 1 is required' }),
    },
  ),
  classTime1: z.string().min(1, 'Time 1 is required'),
  classDay2: z
    .enum([
      '',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
    .optional()
    .default(''),
  classTime2: z.string().optional().default(''),
  online: z.boolean().default(true),
})

export const tokenSchema = z.object({
  role: z.enum(['reviewer', 'admin']),
  consumable: z.boolean(),
  expires: z
    .number()
    .int()
    .min(1, 'Minimum is 1 hour')
    .max(48, 'Maximum is 48 hours'),
})

/**
 * Upper bounds on every free-text and list field of an application or a
 * registration, draft or submitted. They are far above anything a real answer needs; they exist so a
 * hand-crafted request can't store an arbitrarily large document for admin
 * to load and render. `schemas.test.ts` fails if a string or array field in
 * either schema goes without one.
 */
const MAX_TEXT = 2000
const MAX_LIST_ITEMS = 50
const MAX_LIST_ITEM = 200
const textCap = [MAX_TEXT, `Max ${MAX_TEXT} characters`] as const
// A person's name is greeted by name in emails, so it gets a tighter bound
// than free text: room for any real name, none for a paragraph.
const MAX_NAME = 100
const nameCap = [MAX_NAME, `Max ${MAX_NAME} characters`] as const
// The longest address SMTP can deliver to.
const MAX_EMAIL = 254

/**
 * An optional email address, `''` when left blank. Checked here rather than
 * only by the input's `type="email"`, which a hand-crafted request skips:
 * the address it holds is sent mail.
 */
const optionalEmail = z
  .string()
  .trim()
  .max(MAX_EMAIL, `Max ${MAX_EMAIL} characters`)
  .refine(
    (value) => value === '' || z.string().email().safeParse(value).success,
    'Invalid email address',
  )
  .default('')
const boundedList = () =>
  z.array(z.string().max(MAX_LIST_ITEM)).max(MAX_LIST_ITEMS)

/**
 * A checkbox the applicant or parent has to tick before submitting. These
 * used to be plain booleans that only the input's HTML `required` attribute
 * enforced, so the check happened in the browser alone and appeared as a
 * browser popup rather than the inline message every other field shows.
 */
const agreementSchema = z
  .boolean()
  .default(false)
  .refine((checked) => checked, { message: 'Please check this box to submit' })

export const applicationSchema = z.object({
  personal: z.object({
    phoneNumber: z
      .string()
      .min(1, 'Phone number is required')
      .max(...textCap)
      .regex(phoneRegex, 'Invalid phone number format'),
    dateOfBirth: z
      .string()
      .min(1, 'Date of birth is required')
      .max(...textCap)
      .regex(dateRegex, 'Invalid date format (YYYY-MM-DD)'),
    gender: z
      .string()
      .min(1, 'Gender is required')
      .max(...textCap),
    race: boundedList().default([]),
  }),
  academic: z.object({
    school: z
      .string()
      .min(1, 'School is required')
      .max(...textCap),
    graduationYear: z.coerce
      .number()
      .int()
      .min(new Date().getFullYear(), 'Invalid year')
      .max(new Date().getFullYear() + 20, 'Invalid year'),
  }),
  program: z.object({
    courses: boundedList().min(1, 'Select at least one course'),
    preferences: z
      .string()
      .max(...textCap)
      .optional()
      .default(''),
    timeSlots: z
      .string()
      .min(1, 'Timeslots description is required')
      .max(...textCap),
    notAvailable: z
      .string()
      .min(1, 'Conflict description is required')
      .max(...textCap),
    inPerson: z.boolean().default(false),
    reason: z
      .string()
      .min(1, 'Reason is required')
      .max(...textCap),
  }),
  essay: z
    .object({
      taughtBefore: z.boolean().default(false),
      academicBackground: z
        .string()
        .min(1, 'Academic background is required')
        .max(500, 'Max 500 characters'),
      teachingScenario: z
        .string()
        .max(500, 'Max 500 characters')
        .optional()
        .default(''),
      why: z.string().max(500, 'Max 500 characters').optional().default(''),
    })
    // The two newcomer essays are required only of someone who hasn't taught
    // for gbSTEM before, which a per-field rule can't express. Refined here
    // rather than on the whole application so the messages don't wait for
    // every other section to be valid - zod skips an object's refinements
    // while any of its fields fail.
    .superRefine((essay, ctx) => {
      if (essay.taughtBefore) return
      for (const field of ['teachingScenario', 'why'] as const) {
        if (!essay[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: 'Please answer this question',
          })
        }
      }
    }),
  agreements: z.object({
    entireProgram: agreementSchema,
    timeCommitment: agreementSchema,
    submitting: agreementSchema,
  }),
})

/**
 * What a draft save of the application accepts: `applicationSchema`'s fields
 * with none of its "required" rules, since a draft is by definition
 * unfinished. It exists so the server still refuses keys the form doesn't have
 * and values of the wrong type or of unbounded size - `formFieldParity.test.ts`
 * keeps its fields in step with `applicationSchema`'s.
 */
const draftText = z
  .string()
  .max(...textCap)
  .default('')
const draftList = boundedList().default([])
const draftName = z
  .string()
  .max(...nameCap)
  .default('')
export const applicationDraftSchema = z.object({
  personal: z.object({
    phoneNumber: draftText,
    dateOfBirth: draftText,
    gender: draftText,
    race: draftList,
  }),
  academic: z.object({
    school: draftText,
    graduationYear: z.coerce.number().int(),
  }),
  program: z.object({
    courses: draftList,
    preferences: draftText,
    timeSlots: draftText,
    notAvailable: draftText,
    inPerson: z.boolean().default(false),
    reason: draftText,
  }),
  essay: z.object({
    taughtBefore: z.boolean().default(false),
    academicBackground: draftText,
    teachingScenario: draftText,
    why: draftText,
  }),
  agreements: z.object({
    entireProgram: z.boolean().default(false),
    timeCommitment: z.boolean().default(false),
    submitting: z.boolean().default(false),
  }),
})

export const registrationSchema = z.object({
  personal: z.object({
    studentFirstName: z
      .string()
      .min(1, 'First name is required')
      .max(...nameCap),
    studentLastName: z
      .string()
      .min(1, 'Last name is required')
      .max(...nameCap),
    // No `email`: the parent account's address is stamped by
    // registrationOwnedFields from the session, never taken from the form.
    // A second guardian's address, copied on the confirmation email.
    secondaryEmail: optionalEmail,
    phoneNumber: z
      .string()
      .min(1, 'Phone number is required')
      .max(...textCap)
      .regex(phoneRegex, 'Invalid phone number format'),
    dateOfBirth: z
      .string()
      .min(1, 'Date of birth is required')
      .max(...textCap)
      .regex(dateRegex, 'Invalid date format (YYYY-MM-DD)'),
    gender: z
      .string()
      .min(1, 'Gender is required')
      .max(...textCap),
    race: boundedList().default([]),
    frlp: z
      .string()
      .min(1, 'Federal Free or Reduced Lunch Program status is required')
      .max(...textCap),
    parentEducation: z
      .string()
      .min(1, 'Parent education is required')
      .max(...textCap),
  }),
  academic: z.object({
    school: z
      .string()
      .min(1, 'School is required')
      .max(...textCap),
    grade: z
      .string()
      .min(1, 'Grade is required')
      .max(...textCap),
  }),
  // During student registration in the portal website, these aren't specified yet.
  program: z.object({
    csCourse: z
      .string()
      .max(...textCap)
      .optional()
      .default(''),
    mathCourse: z
      .string()
      .max(...textCap)
      .optional()
      .default(''),
    engineeringCourse: z
      .string()
      .max(...textCap)
      .optional()
      .default(''),
    scienceCourse: z
      .string()
      .max(...textCap)
      .optional()
      .default(''),
    inPerson: z.boolean().default(false),
    reason: z
      .string()
      .max(...textCap)
      .optional()
      .default(''),
  }),
  inPerson: z.object({
    allergies: z
      .string()
      .max(...textCap)
      .optional()
      .default(''),
    parentPickup: z
      .string()
      .max(...textCap)
      .optional()
      .default(''),
  }),
  agreements: z.object({
    mediaRelease: z.boolean().default(false),
    bypassAgeLimits: z.boolean().default(false),
    entireProgram: agreementSchema,
    timeCommitment: agreementSchema,
    submitting: agreementSchema,
  }),
})

/**
 * What a draft save of a registration accepts: `registrationSchema`'s fields
 * with none of its "required" rules, for the same reasons as
 * `applicationDraftSchema`. `formFieldParity.test.ts` and `schemas.test.ts`
 * keep the two in step.
 */
export const registrationDraftSchema = z.object({
  personal: z.object({
    studentFirstName: draftName,
    studentLastName: draftName,
    // Validated even in a draft: admin copies stored addresses into mail.
    secondaryEmail: optionalEmail,
    phoneNumber: draftText,
    dateOfBirth: draftText,
    gender: draftText,
    race: draftList,
    frlp: draftText,
    parentEducation: draftText,
  }),
  academic: z.object({
    school: draftText,
    grade: draftText,
  }),
  program: z.object({
    csCourse: draftText,
    mathCourse: draftText,
    engineeringCourse: draftText,
    scienceCourse: draftText,
    inPerson: z.boolean().default(false),
    reason: draftText,
  }),
  inPerson: z.object({
    allergies: draftText,
    parentPickup: draftText,
  }),
  agreements: z.object({
    mediaRelease: z.boolean().default(false),
    bypassAgeLimits: z.boolean().default(false),
    entireProgram: z.boolean().default(false),
    timeCommitment: z.boolean().default(false),
    submitting: z.boolean().default(false),
  }),
})

/**
 * The co-instructors on a class, stored as uids.
 *
 * This used to be a free-text comma-separated email string the class owner
 * typed by hand, which meant any address at all could be given write access
 * to the class document. gbSTEM leadership's rule is that nobody teaches a
 * class they were not interviewed and accepted for, so co-instructors are now
 * added one at a time through /api/lookupCoInstructor, which resolves an
 * address to a uid only when it belongs to an accepted instructor. By the
 * time a uid reaches this schema it has already been vouched for; there is
 * nothing left for the client to validate beyond the shape.
 */
export const otherInstructorUidsSchema = z.array(z.string()).default([])

/**
 * The instructor's per-submission acknowledgement on ClassDetailsForm.
 *
 * `.refine` rather than a plain boolean because this has to *block* the save:
 * it was previously a field named `submitting` that was written to the class
 * document, read by nothing, and required by nothing, so the warning it
 * carried was decorative. Submitting publishes the class for registration, so
 * the instructor has to say so every time - which is also why it is validated
 * but never stored: a persisted `true` would come back ticked and the gate
 * would only ever bite once.
 */
export const confirmationSchema = z
  .boolean()
  .default(false)
  .refine((val) => val === true, {
    message: 'Please confirm you understand the impact of this form submission',
  })

/**
 * What ClassDetailsForm validates: `classSchema` plus the two fields only the
 * portal's instructor-facing form collects.
 *
 * Derived from `classSchema` with `.extend()` rather than spelled out again, so
 * the two can't drift - this used to be a hand-copied duplicate living inside
 * the component, where `formFieldParity.test.ts` couldn't reach it.
 */
export const classDetailsFormSchema = classSchema.extend({
  otherInstructorUids: otherInstructorUidsSchema,
  confirmation: confirmationSchema,
})

export const PASSWORD_MIN_LENGTH = 6
export const PASSWORD_MAX_LENGTH = 64

export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
  )

export const interviewSlotSchema = z.object({
  date: z.string().min(1, 'Date and time is required'),
  meetingLink: z
    .string()
    .trim()
    .min(1, 'Meeting link is required')
    .refine(isAllowedMeetingLink, {
      message: MEETING_LINK_ERROR,
    }),
  interviewerName: z.string().min(1, 'Interviewer name is required'),
  // Kept in parity with admin's copy of this schema, which owns writing
  // interview slots - portal never creates or edits one itself. Both people
  // are named by uid alone; a slot stores no address.
  interviewerUid: z.string().optional().default(''),
  intervieweeFirstName: z.string().optional().default(''),
  intervieweeLastName: z.string().optional().default(''),
  intervieweeId: z.string().optional().default(''),
  interviewSlotStatus: z
    .enum(['available', 'pending', 'missed'])
    .default('available'),
})

export function getApplyFormDefaults() {
  return {
    personal: {
      phoneNumber: '',
      dateOfBirth: '',
      gender: '',
      race: [],
    },
    academic: {
      school: '',
      graduationYear: new Date().getFullYear(),
    },
    program: {
      courses: [],
      preferences: '',
      timeSlots: '',
      notAvailable: '',
      inPerson: false,
      reason: '',
    },
    essay: {
      taughtBefore: false,
      academicBackground: '',
      teachingScenario: '',
      why: '',
    },
    agreements: {
      entireProgram: false,
      timeCommitment: false,
      submitting: false,
    },
  }
}

export function getRegistrationFormDefaults() {
  return {
    personal: {
      studentFirstName: '',
      studentLastName: '',
      secondaryEmail: '',
      phoneNumber: '',
      dateOfBirth: '',
      gender: '',
      frlp: '',
      parentEducation: '',
      race: [],
    },
    academic: {
      school: '',
      grade: '',
    },
    program: {
      csCourse: '',
      mathCourse: '',
      engineeringCourse: '',
      scienceCourse: '',
      inPerson: false,
      reason: '',
    },
    inPerson: {
      allergies: '',
      parentPickup: '',
    },
    agreements: {
      mediaRelease: false,
      bypassAgeLimits: false,
      entireProgram: false,
      timeCommitment: false,
      submitting: false,
    },
  }
}

export function getInterviewSlotDefaults(
  interviewerName = '',
  interviewerUid = '',
) {
  return {
    id: '',
    date: '',
    interviewerName,
    interviewerUid,
    intervieweeFirstName: '',
    intervieweeLastName: '',
    intervieweeId: '',
    meetingLink: '',
    interviewSlotStatus: 'available' as const,
  }
}

export function getClassDataDefaults() {
  return {
    id: '',
    course: '',
    instructorFirstName: '',
    instructorLastName: '',
    classDay1: '',
    classTime1: '',
    classDay2: '',
    classTime2: '',
    meetingLink: '',
    gradeRecommendation: '',
    meetingTimes: [],
    completedClassDates: [],
    feedbackCompleted: [],
    classStatuses: [],
    classCap: 0,
    students: [],
    online: true,
  }
}
