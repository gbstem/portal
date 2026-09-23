import { handleApiError, verifyStudent } from '$lib/server/apiHelpers'
import { fileStudentFeedback } from '$lib/server/classFeedback'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const studentFeedbackSchema = z.object({
  // The student's name, the course and the instructor are read from these
  // two documents server-side, not taken from the caller.
  studentId: z.string().min(1, 'Please select a child'),
  classId: z.string().min(1, 'Please select a course'),
  date: z.string().min(1, 'Date of class is required'),
  rating: z.coerce
    .number()
    .int()
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must be at most 5'),
  feedback: z.string().min(1, 'Feedback is required'),
})

export type StudentFeedbackRequestBody = z.infer<typeof studentFeedbackSchema>

export interface StudentFeedbackResponse {
  feedbackId: string
}

/**
 * Files a parent's weekly feedback on a class one of their students is in
 * (see fileStudentFeedback).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyStudent(locals)
    const body = studentFeedbackSchema.parse(await request.json())
    const response: StudentFeedbackResponse = {
      feedbackId: await fileStudentFeedback({ uid: user.uid }, body),
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/studentFeedback', err)
  }
}
