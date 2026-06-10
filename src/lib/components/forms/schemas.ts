// Zod schemas that we use for input validation across all of our forms, and
// also in seed.ts for ensuring our test data is valid.
import { z } from 'zod'

const phoneRegex = /^[\d\s\-+]+$/
const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const classSchema = z.object({
  course: z.string().min(1, 'Course is required'),
  gradeRecommendation: z.string().optional().default(''),
  classCap: z.coerce.number().min(0, 'Capacity must be at least 0'),
  meetingLink: z.string().optional().default(''),
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

export const applicationSchema = z.object({
  personal: z.object({
    phoneNumber: z
      .string()
      .min(1, 'Phone number is required')
      .regex(phoneRegex, 'Invalid phone number format'),
    dateOfBirth: z
      .string()
      .min(1, 'Date of birth is required')
      .regex(dateRegex, 'Invalid date format (YYYY-MM-DD)'),
    gender: z.string().min(1, 'Gender is required'),
    race: z.array(z.string()).default([]),
  }),
  academic: z.object({
    school: z.string().min(1, 'School is required'),
    graduationYear: z.coerce
      .number()
      .int()
      .min(new Date().getFullYear(), 'Invalid year')
      .max(new Date().getFullYear() + 20, 'Invalid year'),
  }),
  program: z.object({
    courses: z.array(z.string()).min(1, 'Select at least one course'),
    preferences: z.string().optional().default(''),
    timeSlots: z.string().min(1, 'Timeslots description is required'),
    notAvailable: z.string().min(1, 'Conflict description is required'),
    inPerson: z.boolean().default(false),
    reason: z.string().min(1, 'Reason is required'),
  }),
  essay: z.object({
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
  }),
  agreements: z.object({
    entireProgram: z.boolean().default(false),
    timeCommitment: z.boolean().default(false),
    submitting: z.boolean().default(false),
  }),
})

export const registrationSchema = z.object({
  personal: z.object({
    studentFirstName: z.string().min(1, 'First name is required'),
    studentLastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    secondaryEmail: z.string().optional().default(''),
    phoneNumber: z
      .string()
      .min(1, 'Phone number is required')
      .regex(phoneRegex, 'Invalid phone number format'),
    dateOfBirth: z
      .string()
      .min(1, 'Date of birth is required')
      .regex(dateRegex, 'Invalid date format (YYYY-MM-DD)'),
    gender: z.string().min(1, 'Gender is required'),
    race: z.array(z.string()).default([]),
    frlp: z
      .string()
      .min(1, 'Federal Free or Reduced Lunch Program status is required'),
    parentEducation: z.string().min(1, 'Parent education is required'),
  }),
  academic: z.object({
    school: z.string().min(1, 'School is required'),
    grade: z.string().min(1, 'Grade is required'),
  }),
  // During student registration in the portal website, these aren't specified yet.
  program: z.object({
    csCourse: z.string().optional().default(''),
    mathCourse: z.string().optional().default(''),
    engineeringCourse: z.string().optional().default(''),
    scienceCourse: z.string().optional().default(''),
    inPerson: z.boolean().default(false),
    reason: z.string().optional().default(''),
  }),
  inPerson: z.object({
    allergies: z.string().optional().default(''),
    parentPickup: z.string().optional().default(''),
  }),
  agreements: z.object({
    mediaRelease: z.boolean().default(false),
    bypassAgeLimits: z.boolean().default(false),
    entireProgram: z.boolean().default(false),
    timeCommitment: z.boolean().default(false),
    submitting: z.boolean().default(false),
  }),
})
