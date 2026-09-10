import { renderEmail } from '$lib/emails/render'
import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { getAuthorizedClass, getStudentSnaps } from '$lib/server/classDirectory'
import { sendEmail } from '$lib/server/email'
import { resolveCoInstructorEmails } from '$lib/server/instructorDirectory'
import { authorizeSubstituteSession } from '$lib/server/substituteSessions'
import { error, json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const remindStudentsSchema = z.object({
  classId: z.string().min(1, 'Class ID is required'),
  classTime: z.string().min(1, 'Class time is required'),
  studentUid: z.string().optional(),
  subRequestId: z.string().optional(),
})

export type RemindStudentsRequestBody = z.infer<typeof remindStudentsSchema>
export type ClassRemindStudentsRequestBody = RemindStudentsRequestBody

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = remindStudentsSchema.parse(await request.json())

    let classData: Data.Class
    let instructorName = ''
    let ccEmails: string[] = []

    if (body.subRequestId) {
      const authorizedSub = await authorizeSubstituteSession(
        user.uid,
        body.subRequestId,
      )
      classData = authorizedSub.classData
      instructorName =
        authorizedSub.subRequest.subInstructorFirstName || 'Instructor'
      // A substitute's reminder speaks only for the session they cover; no co-instructor CCs
      ccEmails = []
    } else {
      classData = await getAuthorizedClass(body.classId, user)

      instructorName = classData.instructorFirstName || 'Instructor'
      const instructorUids = [
        classData.instructorUid ?? '',
        ...(classData.otherInstructorUids ?? []),
      ].filter(Boolean)

      ccEmails = await resolveCoInstructorEmails(
        instructorUids.filter((uid) => uid !== user.uid),
      )
    }

    let targetUids: string[] = []
    if (body.studentUid) {
      if (!classData.students?.includes(body.studentUid)) {
        throw error(400, 'Student is not enrolled in this class.')
      }
      targetUids = [body.studentUid]
    } else {
      targetUids = classData.students ?? []
    }

    if (targetUids.length === 0) {
      return json(
        { message: 'That class has no students to remind.', count: 0 },
        { status: 400 },
      )
    }

    const studentSnaps = await getStudentSnaps(targetUids)

    let sentCount = 0
    for (const snap of studentSnaps) {
      if (!snap.exists) continue
      const data = snap.data() as any
      const personal = data?.personal || {}
      const studentEmail = personal.email
      if (!studentEmail) continue

      const firstName = personal.studentFirstName || 'Student'
      const template = {
        name: 'classReminder',
        data: {
          subject: 'gbSTEM Class Reminder',
          app: {
            firstName,
            name: 'Portal',
            class: classData.course || '',
            classTime: body.classTime,
            instructor: instructorName,
            link: 'https://portal.gbstem.org',
          },
        },
      }

      const htmlBody = renderEmail('classReminderEmailTemplate', template.data)

      try {
        await sendEmail({
          to: studentEmail,
          cc: ccEmails,
          subject: String(template.data.subject),
          html: htmlBody,
        })
        sentCount++
      } catch (mailError) {
        console.error(
          `Failed to send reminder email to ${studentEmail}:`,
          mailError,
        )
      }
    }

    return json({
      message: 'Reminder emails were sent!',
      count: sentCount,
    })
  } catch (err) {
    throw handleApiError('/api/remindStudents', err)
  }
}
