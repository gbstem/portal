import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { getAuthorizedClass, getStudentSnaps } from '$lib/server/classDirectory'
import { authorizeSubstituteSession } from '$lib/server/substituteSessions'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

export interface RosterStudent {
  uid: string
  name: string
  email: string
  secondaryEmail: string
  phone: string
  grade: string | number
  school: string
}

const classRosterQuerySchema = z.object({
  classId: z.string().min(1, 'classId is required'),
  subRequestId: z.string().optional(),
})

/**
 * Returns the student roster for a class.
 *
 * Instructors only receive non-sensitive contact and academic data
 * (name, email, secondary email, phone, grade, school) for students
 * in classes they teach or are substituting for. Sensitive demographics,
 * financial aid (FRLP), health/allergies, and DOB are never returned.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const { classId, subRequestId } = classRosterQuerySchema.parse({
      classId: url.searchParams.get('classId') ?? '',
      subRequestId: url.searchParams.get('subRequestId') ?? undefined,
    })

    let classData: Data.Class

    if (subRequestId) {
      // If a substitute request is supplied, verify the caller is the assigned substitute.
      const authorizedSub = await authorizeSubstituteSession(
        user.uid,
        subRequestId,
      )
      classData = authorizedSub.classData
    } else {
      classData = await getAuthorizedClass(classId, user)
    }

    const studentUids: string[] = Array.from(new Set(classData.students ?? []))
    const studentSnaps = await getStudentSnaps(studentUids)

    const students: RosterStudent[] = studentSnaps.map((snap, idx) => {
      const uid = studentUids[idx]
      if (!snap.exists) {
        return {
          uid,
          name: 'Unknown Student',
          email: '',
          secondaryEmail: '',
          phone: '',
          grade: '',
          school: '',
        }
      }
      const data = snap.data() as any
      const personal = data?.personal || {}
      const academic = data?.academic || {}
      const fullName =
        `${personal.studentFirstName ?? ''} ${personal.studentLastName ?? ''}`.trim()

      return {
        uid,
        name: fullName || 'Unknown Student',
        email: personal.email ?? '',
        secondaryEmail: personal.secondaryEmail ?? '',
        phone: personal.phoneNumber ?? '',
        grade: academic.grade ?? '',
        school: academic.school ?? '',
      }
    })

    return json({ students })
  } catch (err) {
    throw handleApiError('/api/classRoster', err)
  }
}
