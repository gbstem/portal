import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import {
  isAcceptedInstructor,
  lookupAcceptedInstructorByEmail,
  NOT_AN_ACCEPTED_INSTRUCTOR,
} from '$lib/server/instructorDirectory'
import { json, error } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const lookupCoInstructorSchema = z.object({
  email: z.string().min(1, 'Enter an email address'),
})

export type LookupCoInstructorRequestBody = z.infer<
  typeof lookupCoInstructorSchema
>

/**
 * Resolves one co-instructor email to a uid, for ClassDetailsForm's
 * add-a-co-instructor box.
 *
 * Restricted to callers who are themselves accepted instructors: this is
 * still an oracle for "is this address an accepted instructor", and that is
 * the narrowest audience that can use the feature at all.
 *
 * TODO(rate limiting): nothing in this codebase rate limits anything yet, so
 * the only thing bounding enumeration here is the accepted-instructor session
 * gate. If a general rate limiter ever lands, this endpoint wants it.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const caller = verifyInstructor(locals)
    if (!(await isAcceptedInstructor(caller.uid))) {
      throw error(403, 'Only accepted instructors can add co-instructors.')
    }

    const { email } = lookupCoInstructorSchema.parse(await request.json())
    const instructor = await lookupAcceptedInstructorByEmail(
      email.trim().toLowerCase(),
    )
    if (!instructor) {
      throw error(404, NOT_AN_ACCEPTED_INSTRUCTOR)
    }

    return json({ instructor })
  } catch (err) {
    throw handleApiError('/api/lookupCoInstructor', err)
  }
}
