import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { resolveCoInstructorIdentities } from '$lib/server/instructorDirectory'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const resolveCoInstructorsSchema = z.object({
  uids: z.array(z.string()),
})

export type ResolveCoInstructorsRequestBody = z.infer<
  typeof resolveCoInstructorsSchema
>

/**
 * Resolves the uids already stored on a class to displayable identities.
 *
 * Far less sensitive than /api/lookupCoInstructor: it only expands uids the
 * caller's own class document already lists, so it discloses nothing they
 * can't already read straight out of Firestore. Uids with no Auth account are
 * dropped rather than erroring - see resolveCoInstructorIdentities.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyInstructor(locals)
    const { uids } = resolveCoInstructorsSchema.parse(await request.json())

    const instructors = await resolveCoInstructorIdentities(uids)
    return json({ instructors })
  } catch (err) {
    throw handleApiError('/api/resolveCoInstructors', err)
  }
}
