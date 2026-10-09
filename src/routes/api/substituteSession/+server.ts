import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import {
  authorizeSubstituteSession,
  recordSubstituteSession,
  type RecordedSubstituteSession,
} from '$lib/server/substituteSessions'
import { error, json } from '@sveltejs/kit'
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

export interface SubstituteSessionLinkResponse {
  meetingLink: string
}

/**
 * The meeting link of a class session the caller is the substitute for, so
 * they can check it before recording the session. Class documents aren't
 * readable from the browser (see firestore.rules).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  try {
    const user = verifyInstructor(locals)
    const subRequestId = url.searchParams.get('subRequestId')
    if (!subRequestId) {
      throw error(400, 'A substitute request is required')
    }
    const { classData } = await authorizeSubstituteSession(
      user.uid,
      subRequestId,
    )
    const response: SubstituteSessionLinkResponse = {
      meetingLink: classData.meetingLink ?? '',
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/substituteSession', err)
  }
}

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
