import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { getAuthorizedClass } from '$lib/server/classDirectory'
import { resolveCoInstructorIdentities } from '$lib/server/instructorDirectory'
import { error, json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const resolveCoInstructorsSchema = z.object({
  classId: z.string().min(1, 'A class is required'),
  uids: z.array(z.string()),
})

export type ResolveCoInstructorsRequestBody = z.infer<
  typeof resolveCoInstructorsSchema
>

/**
 * Resolves the co-instructor uids stored on one of the caller's classes to
 * displayable identities.
 *
 * The caller must teach `classId`, and every requested uid must be one that
 * class already lists as a co-instructor. Without that tie to a class this
 * resolved any uid at all, which let anyone who picked "instructor" at signup
 * turn the uids readable off class documents - parents included - into names
 * and email addresses. A uid the class doesn't list is refused outright
 * rather than silently omitted, because the form reads an omitted uid as a
 * deleted account and drops it on the next save.
 *
 * Uids with no Auth account are dropped rather than erroring - see
 * resolveCoInstructorIdentities.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const { classId, uids } = resolveCoInstructorsSchema.parse(
      await request.json(),
    )

    const classData = await getAuthorizedClass(classId, user)
    const listed = new Set(classData.otherInstructorUids ?? [])
    if (!uids.every((uid) => listed.has(uid))) {
      throw error(403, 'Those instructors are not on that class.')
    }

    const instructors = await resolveCoInstructorIdentities(uids)
    return json({ instructors })
  } catch (err) {
    throw handleApiError('/api/resolveCoInstructors', err)
  }
}
