import type { ClassInfo } from '$lib/helpers/classesPage'
import { handleApiError, verifyAuthenticated } from '$lib/server/apiHelpers'
import { fetchClassListings } from '$lib/server/classListings'
import { json } from '@sveltejs/kit'
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
    return json(response)
  } catch (err) {
    throw handleApiError('/api/classes', err)
  }
}
