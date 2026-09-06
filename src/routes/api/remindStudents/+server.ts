import { verifyInstructor, handleApiError } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { resolveCoInstructorEmails } from '$lib/server/instructorDirectory'
import { renderEmail } from '$lib/emails/render'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const remindStudentsSchema = z.object({
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

export type RemindStudentsRequestBody = z.infer<typeof remindStudentsSchema>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = remindStudentsSchema.parse(await request.json())

    const email = body.email
    // Everyone teaching the class except whoever is sending it. The list used
    // to be the class's `otherInstructorUids` alone, which is the owner's
    // colleagues - correct when the owner sends, exactly backwards when a
    // co-instructor does: they cc'd themselves and copied the primary on
    // nothing. Dropping the caller by uid rather than by address means an
    // account whose email has changed is still recognised as the sender.
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
