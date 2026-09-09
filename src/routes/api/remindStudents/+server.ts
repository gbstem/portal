import { renderEmail } from '$lib/emails/render'
import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { getAuthorizedClass, getStudentSnaps } from '$lib/server/classDirectory'
import { sendEmail } from '$lib/server/email'
import { resolveCoInstructorEmails } from '$lib/server/instructorDirectory'
import { authorizeSubstituteSession } from '$lib/server/substituteSessions'
import { error, json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const classRemindStudentsSchema = z.object({
  classId: z.string().min(1, 'Class ID is required'),
  classTime: z.string().min(1, 'Class time is required'),
  studentUid: z.string().optional(),
  subRequestId: z.string().optional(),
})

// TODO(rip-out-compat): Remove legacy remindStudents schema once older clients have upgraded (~1 week soak)
const legacyRemindStudentsSchema = z.object({
  email: z.string().email('Invalid email address'),
  // Every instructor on the class, the caller included - the server drops the
  // caller below. Uids, not addresses: the emails are resolved here rather
  // than sent up by the client, so a cc always goes to the account's current
  // address and a client can't dictate who gets copied on a reminder.
  instructorUids: z.array(z.string()).default([]),
  name: z.string().min(1, 'Name is required'),
  class: z.string().min(1, 'Class is required'),
  classTime: z.string().min(1, 'Class time is required'),
  instructorName: z.string().min(1, 'Instructor name is required'),
})

const remindStudentsSchema = z.union([
  classRemindStudentsSchema,
  legacyRemindStudentsSchema,
])

export type ClassRemindStudentsRequestBody = z.infer<
  typeof classRemindStudentsSchema
>
export type LegacyRemindStudentsRequestBody = z.infer<
  typeof legacyRemindStudentsSchema
>
export type RemindStudentsRequestBody = z.infer<typeof remindStudentsSchema>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = remindStudentsSchema.parse(await request.json())

    if ('classId' in body) {
      //
      // --- NEW CLASS-BASED DISPATCH ---
      // Verifies class authorization and resolves all student emails & names server-side
      //
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

        const htmlBody = renderEmail(
          'classReminderEmailTemplate',
          template.data,
        )

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
    }

    //
    // TODO(rip-out-compat): Remove this legacy branch once older clients have upgraded (~1 week soak)
    //
    const email = body.email
    const ccEmails = await resolveCoInstructorEmails(
      body.instructorUids.filter((uid) => uid !== user.uid),
    )

    const template = {
      name: 'classReminder',
      data: {
        subject: 'gbSTEM Class Reminder',
        app: {
          firstName: body.name,
          name: 'Portal',
          class: body.class,
          classTime: body.classTime,
          instructor: body.instructorName,
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = renderEmail('classReminderEmailTemplate', template.data)

    try {
      await sendEmail({
        to: email,
        cc: ccEmails,
        subject: String(template.data.subject),
        html: htmlBody,
      })
    } catch (mailError) {
      return json(
        { error: 'Failed to send email. Please try again later.' },
        { status: 500 },
      )
    }

    return json({ message: 'Email sent successfully.' })
  } catch (err) {
    throw handleApiError('/api/remindStudents', err)
  }
}
