import type { ClassInfo } from '#lib/helpers/classesPage.js'
import { handleApiError, verifyAuthenticated } from '#lib/server/apiHelpers.js'
import { fetchClassListings } from '#lib/server/classListings.js'
import type { RequestHandler } from './$types'

export interface ClassesResponse {
  classes: ClassInfo[]
}

/**
 * This semester's classes as the /classes page lists them - see
 * fetchClassListings for what each caller gets.
 */
export const GET: RequestHandler = async ({ locals }) => {
  try {
    const user = verifyAuthenticated(locals)
    const response: ClassesResponse = {
      classes: await fetchClassListings(user),
    }
    return Response.json(response)
  } catch (err) {
    throw handleApiError('/api/classes', err)
  }
}
