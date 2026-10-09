import { handleApiError, verifyInstructor } from '#lib/server/apiHelpers.js'
import {
  cancelSubRequest,
  editSubRequest,
  fileSubRequest,
} from '#lib/server/substituteRequests.js'
import { z } from 'zod'
import type { RequestHandler } from './$types'

// Who the request names, and when its session is, are read from the class,
// never taken from here.
const sessionFields = {
  classNumber: z.coerce.number().int().min(1),
  notes: z.string().max(5000),
}

const fileSchema = z.object({
  classId: z.string().min(1, 'Class is required'),
  ...sessionFields,
})

const editSchema = z.object({
  subRequestId: z.string().min(1, 'A substitute request is required'),
  ...sessionFields,
})

const cancelSchema = z.object({
  subRequestId: z.string().min(1, 'A substitute request is required'),
})

export type FileSubRequestBody = z.input<typeof fileSchema>
export type EditSubRequestBody = z.input<typeof editSchema>
export type CancelSubRequestBody = z.input<typeof cancelSchema>

export interface SubRequestResponse {
  /** The request's document id, which changes when it moves session. */
  subRequestId: string
}

/**
 * The class instructor's side of a sub request: filing, editing and
 * cancelling one - see #lib/server/substituteRequests. The substitute's side
 * (finding and claiming one) is /api/substitute.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const { classId, ...input } = fileSchema.parse(await request.json())
    const response: SubRequestResponse = {
      subRequestId: await fileSubRequest({ uid: user.uid }, classId, input),
    }
    return Response.json(response)
  } catch (err) {
    throw handleApiError('/api/subRequest', err)
  }
}

export const PATCH: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const { subRequestId, ...input } = editSchema.parse(await request.json())
    const response: SubRequestResponse = {
      subRequestId: await editSubRequest(
        { uid: user.uid },
        subRequestId,
        input,
      ),
    }
    return Response.json(response)
  } catch (err) {
    throw handleApiError('/api/subRequest', err)
  }
}

export const DELETE: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const { subRequestId } = cancelSchema.parse(await request.json())
    await cancelSubRequest({ uid: user.uid }, subRequestId)
    const response: SubRequestResponse = { subRequestId }
    return Response.json(response)
  } catch (err) {
    throw handleApiError('/api/subRequest', err)
  }
}
