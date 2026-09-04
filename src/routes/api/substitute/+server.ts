import { handleApiError, verifyInstructor } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { adminAuth } from '$lib/server/firebase'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const substituteSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  course: z.string().min(1, 'Course is required'),
  classNumber: z.union([z.string(), z.number()]),
  date: z.string().min(1, 'Date is required'),
  originalInstructorUid: z.string().optional(),
  originalInstructorEmail: z
    .string()
    .email('Invalid original instructor email address')
    .optional(),
  subInstructorEmail: z
    .string()
    .email('Invalid substitute instructor email address')
    .optional(),
})

export type SubstituteRequestBody = z.infer<typeof substituteSchema>

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyInstructor(locals)
    const body = substituteSchema.parse(await request.json())

    let originalInstructorEmail = body.originalInstructorEmail
    if (body.originalInstructorUid) {
      try {
        const originalUser = await adminAuth.getUser(body.originalInstructorUid)
        if (originalUser.email) {
          originalInstructorEmail = originalUser.email
        }
      } catch (err) {
        console.error(
          'Failed to resolve original instructor email by uid, falling back to passed email:',
          err,
        )
      }
    }

    if (!originalInstructorEmail) {
      return json(
        { error: 'Original instructor email could not be resolved.' },
        { status: 400 },
      )
    }

    const template = {
      name: 'interviewSlotRequest',
      data: {
        subject: 'Class Substitute Confirmation',
        app: {
          firstName: body.firstName,
          course: body.course,
          classNumber: body.classNumber,
          date: body.date,
          name: 'Portal',
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = renderEmail('substituteClassEmailTemplate', template.data)

    try {
      await sendEmail({
        to: user.email,
        cc: originalInstructorEmail,
        subject: String(template.data.subject),
        html: htmlBody,
        replyTo: originalInstructorEmail,
      })
    } catch (mailError) {
      return json(
        { error: 'Failed to send email. Please try again later.' },
        { status: 500 },
      )
    }

    return json({ message: 'Email sent successfully.' })
  } catch (err) {
    throw handleApiError('/api/substitute', err)
  }
}
