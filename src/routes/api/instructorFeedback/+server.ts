import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { fileInstructorFeedback } from '$lib/server/classFeedback'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const instructorFeedbackSchema = z.object({
  // The course and the instructor's name are read server-side, not taken from
  // the caller.
  classId: z.string().min(1, 'A class is required'),
  date: z.string().min(1, 'Date of class is required'),
  feedback: z.string().min(1, 'Reflection/feedback is required'),
  // Keyed by student name, the way the roster renders them.
  attendanceList: z.record(z.object({ present: z.boolean() })),
  classNumber: z.coerce.number().int().min(1),
})

export type InstructorFeedbackRequestBody = z.infer<
  typeof instructorFeedbackSchema
>

export interface InstructorFeedbackResponse {
  feedbackId: string
}

/**
 * Files an instructor's feedback for a session of a class they teach (see
 * fileInstructorFeedback).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = instructorFeedbackSchema.parse(await request.json())
    const response: InstructorFeedbackResponse = {
      feedbackId: await fileInstructorFeedback({ uid: user.uid }, body),
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/instructorFeedback', err)
  }
}
