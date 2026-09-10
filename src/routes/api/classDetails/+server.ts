import {
  classSchema,
  otherInstructorUidsSchema,
} from '$lib/components/forms/schemas'
import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import {
  fetchInstructorClasses,
  saveClassDetails,
  type SerializedClass,
} from '$lib/server/instructorClasses'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const classDetailsSchema = z.object({
  classId: z.string().min(1, 'Class is required'),
  details: classSchema.extend({
    otherInstructorUids: otherInstructorUidsSchema,
  }),
  // Present only when the form rebuilt the schedule; the server refuses a
  // save that changes the class days or times without one.
  schedule: z
    .object({
      meetingTimes: z.array(z.coerce.date()),
      feedbackCompleted: z.array(z.boolean()),
      classStatuses: z.array(z.string()),
    })
    .refine(
      (schedule) =>
        schedule.feedbackCompleted.length === schedule.meetingTimes.length &&
        schedule.classStatuses.length === schedule.meetingTimes.length,
      { message: 'Every session needs a status and a feedback flag' },
    )
    .optional(),
})

export type ClassDetailsRequestBody = z.input<typeof classDetailsSchema>

export interface ClassDetailsResponse {
  classes: Record<string, SerializedClass>
}

/**
 * The signed-in instructor's classes: the ones they own and the ones shared
 * with them as a co-instructor.
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyInstructor(locals)
    const response: ClassDetailsResponse = {
      classes: await fetchInstructorClasses(user.uid),
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/classDetails', err)
  }
}

/**
 * Creates or updates one class. Ownership, co-instructor eligibility and the
 * dashboard mappings are decided server-side - see saveClassDetails.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = classDetailsSchema.parse(await request.json())
    await saveClassDetails(
      { uid: user.uid, email: user.email },
      body.classId,
      body.details,
      body.schedule,
    )
    return json({ classId: body.classId })
  } catch (err) {
    throw handleApiError('/api/classDetails', err)
  }
}
