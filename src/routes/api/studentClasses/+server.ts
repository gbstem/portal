import { handleApiError, verifyStudent } from '#lib/server/apiHelpers.js'
import {
  fetchStudentClasses,
  type StudentClass,
} from '#lib/server/classListings.js'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export type { StudentClass }

export interface StudentClassesResponse {
  classes: StudentClass[]
}

/**
 * The classes one of the signed-in parent's students is enrolled in, with
 * their schedules and meeting links - see fetchStudentClasses.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  try {
    const user = verifyStudent(locals)
    const studentUid = url.searchParams.get('studentUid')
    if (!studentUid) {
      throw error(400, 'A student is required.')
    }
    const response: StudentClassesResponse = {
      classes: await fetchStudentClasses(user.uid, studentUid),
    }
    return Response.json(response)
  } catch (err) {
    throw handleApiError('/api/studentClasses', err)
  }
}
