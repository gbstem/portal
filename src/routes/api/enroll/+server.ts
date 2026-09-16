import { renderEmail } from '$lib/emails/render'
import { parseClassInfoDoc } from '$lib/helpers/classesPage'
import { handleApiError, verifyStudent } from '$lib/server/apiHelpers'
import {
  enrollStudent,
  unenrollStudent,
  type Enrollment,
} from '$lib/server/classEnrollments'
import { sendEmail } from '$lib/server/email'
import { adminAuth, adminDb } from '$lib/server/firebase'
import { formatTime24to12 } from '$lib/utils'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const enrollmentSchema = z.object({
  // Everything else - the class's details, its instructor and the student's
  // name - is read from these two documents, not taken from the caller.
  classId: z.string().min(1, 'A class is required'),
  studentUid: z.string().min(1, 'Please select a child'),
})

export type EnrollRequestBody = z.infer<typeof enrollmentSchema>

export interface EnrollResponse {
  /** False when the enrollment stands but its confirmation email wasn't sent. */
  emailSent: boolean
}

export interface UnenrollResponse {
  message: string
}

/**
 * The class's instructor at their current address, resolved from Auth by the
 * class's `instructorUid`. There is deliberately no fallback to an address
 * stored on the class, and since the uid migration a class stores none at all.
 * A class with no uid, or one naming no Auth account, is logged and gets no
 * confirmation.
 */
async function resolveInstructorEmail(
  classId: string,
  classData: Data.Class,
): Promise<string | undefined> {
  const { instructorUid } = classData
  if (!instructorUid) {
    console.error(`[API /api/enroll] Class ${classId} has no instructorUid`)
    return undefined
  }
  try {
    const instructor = await adminAuth.getUser(instructorUid)
    if (instructor.email) return instructor.email
    console.error(
      `[API /api/enroll] instructorUid ${instructorUid} has no email on its Auth account`,
    )
  } catch (err) {
    console.error(
      `[API /api/enroll] instructorUid ${instructorUid} could not be resolved from Auth:`,
      err,
    )
  }
  return undefined
}

/**
 * Emails the parent their student's class details, copying the instructor.
 * Reports failure rather than throwing: the enrollment has already been
 * written by the time this runs.
 */
async function sendEnrollmentConfirmation(
  parent: { uid: string; email: string },
  classId: string,
  { classData, registration }: Enrollment,
): Promise<boolean> {
  const instructorEmail = await resolveInstructorEmail(classId, classData)
  if (!instructorEmail) {
    console.error(
      `[API /api/enroll] No instructor email resolved for class ${classId}; the confirmation was not sent.`,
    )
    return false
  }

  const profile = (await adminDb.doc(`users/${parent.uid}`).get()).data() ?? {}
  const classInfo = parseClassInfoDoc(classId, classData)
  const [class1Time, class2Time] = classInfo.classDays.map(
    (day, index) =>
      `${day} at ${formatTime24to12(classInfo.classTimes[index])}`,
  )
  const studentName =
    `${registration.personal?.studentFirstName ?? ''} ${registration.personal?.studentLastName ?? ''}`.trim()

  const data = {
    subject: `${classInfo.course} class details for ${studentName}`,
    app: {
      name: 'Portal',
      link: 'https://portal.gbstem.org',
      instructor: classInfo.instructorFirstName,
      firstName: profile.firstName ?? '',
      class1Time,
      class2Time,
      meetingLink: classInfo.meetingLink,
      course: classInfo.course,
      instructorEmail,
      online: classInfo.online,
      studentName,
    },
  }

  try {
    await sendEmail({
      to: parent.email,
      cc: instructorEmail,
      subject: data.subject,
      html: renderEmail(
        classInfo.online
          ? 'onlineClassEnrolledEmailTemplate'
          : 'inPersonClassEnrolledEmailTemplate',
        data,
      ),
    })
    return true
  } catch (err) {
    console.error(
      `[API /api/enroll] Failed to send the confirmation for class ${classId}:`,
      err,
    )
    return false
  }
}

/**
 * Enrolls one of the caller's students in a class (see enrollStudent), then
 * sends the confirmation.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyStudent(locals)
    const { classId, studentUid } = enrollmentSchema.parse(await request.json())
    const enrollment = await enrollStudent(
      { uid: user.uid },
      classId,
      studentUid,
    )
    const response: EnrollResponse = {
      emailSent: await sendEnrollmentConfirmation(user, classId, enrollment),
    }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/enroll', err)
  }
}

/** Takes one of the caller's students out of a class (see unenrollStudent). */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyStudent(locals)
    const { classId, studentUid } = enrollmentSchema.parse(await request.json())
    await unenrollStudent({ uid: user.uid }, classId, studentUid)
    const response: UnenrollResponse = { message: 'Unenrolled from class.' }
    return json(response)
  } catch (err) {
    throw handleApiError('/api/enroll', err)
  }
}
