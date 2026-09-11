import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import {
  recordSubstituteSession,
  type RecordedSubstituteSession,
} from '$lib/server/substituteSessions'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const substituteSessionSchema = z.object({
  // The document id, which carries the class and the session: everything else
  // this endpoint acts on is read from the request itself rather than taken
  // from the caller.
  subRequestId: z.string().min(1, 'A substitute request is required'),
})

export type SubstituteSessionRequestBody = z.infer<
  typeof substituteSessionSchema
>

export type SubstituteSessionResponse = RecordedSubstituteSession

/**
 * Records that a substitute is holding a class they signed up to cover (see
 * recordSubstituteSession).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = substituteSessionSchema.parse(await request.json())
    const response: SubstituteSessionResponse = await recordSubstituteSession(
      user.uid,
      body.subRequestId,
    )
    return json(response)
  } catch (err) {
    throw handleApiError('/api/substituteSession', err)
  }
}
