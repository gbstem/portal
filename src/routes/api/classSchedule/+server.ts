import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import {
  holdClassSession,
  refreshClassStatuses,
  rescheduleClass,
  type SerializedSchedule,
} from '$lib/server/classSchedule'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const classId = z.string().min(1, 'Class is required')

// Only what the instructor actually chooses crosses the wire: which class,
// and for a reschedule the new times. Every per-session status is worked out
// server-side from the class as stored.
const classScheduleSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('refreshStatuses'), classId }),
  z.object({
    action: z.literal('reschedule'),
    classId,
    meetingTimes: z
      .array(z.coerce.date())
      .min(1, 'A class needs at least one session.')
      .max(200),
  }),
  z.object({ action: z.literal('holdSession'), classId }),
])

export type { SerializedSchedule }

export type ClassScheduleRequestBody = z.input<typeof classScheduleSchema>

export type ClassScheduleResponse =
  { classStatuses: string[] } | SerializedSchedule | { meetingLink: string }

/**
 * Changes a class's schedule on behalf of one of its instructors - see
 * $lib/server/classSchedule for what each action does and who may take it.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = classScheduleSchema.parse(await request.json())
    const caller = { uid: user.uid }
    let response: ClassScheduleResponse
    switch (body.action) {
      case 'refreshStatuses':
        response = {
          classStatuses: await refreshClassStatuses(caller, body.classId),
        }
        break
      case 'reschedule':
        response = await rescheduleClass(
          caller,
          body.classId,
          body.meetingTimes,
        )
        break
      case 'holdSession':
        response = await holdClassSession(caller, body.classId)
        break
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/classSchedule', err)
  }
}
