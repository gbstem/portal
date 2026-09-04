import { verifyAuthenticated, handleApiError } from '$lib/server/apiHelpers'
import { resolveInstructorUids } from '$lib/server/resolveInstructorUids'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { z } from 'zod'

const resolveInstructorUidsSchema = z.object({
  emails: z.array(z.string()),
})

export type ResolveInstructorUidsRequestBody = z.infer<
  typeof resolveInstructorUidsSchema
>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAuthenticated(locals)
    const { emails } = resolveInstructorUidsSchema.parse(await request.json())

    const uidsByEmail = await resolveInstructorUids(emails)
    return json({ uidsByEmail })
  } catch (err) {
    throw handleApiError('/api/resolveInstructorUids', err)
  }
}
