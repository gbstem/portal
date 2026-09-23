import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { fileSubstituteFeedback } from '$lib/server/substituteSessions'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const substituteFeedbackSchema = z.object({
  subRequestId: z.string().min(1, 'A substitute request is required'),
  date: z.string().min(1, 'Date of class is required'),
  feedback: z.string().min(1, 'Reflection/feedback is required'),
  // Keyed by student name, the way the roster renders them.
  attendanceList: z.record(z.object({ present: z.boolean() })),
  // Checked against the request rather than trusted: the form lets it be
  // typed, and a substitute is covering one specific session.
  classNumber: z.coerce.number().int().min(1),
})

export type SubstituteFeedbackRequestBody = z.infer<
  typeof substituteFeedbackSchema
>

export interface SubstituteFeedbackResponse {
  feedbackId: string
}

/**
 * Files a substitute's feedback for the class they covered (see
 * fileSubstituteFeedback).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = substituteFeedbackSchema.parse(await request.json())
    const response: SubstituteFeedbackResponse = {
      feedbackId: await fileSubstituteFeedback(user.uid, body),
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/substituteFeedback', err)
  }
}
