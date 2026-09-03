import { verifyAuthenticated, handleApiError } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { renderEmail } from '$lib/emails/render'
import { formatTime24to12 } from '$lib/utils'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export interface EnrollRequestBody {
  classTimes: string[]
  classDays: string[]
  course: string
  studentName: string
  instructor: string
  firstName: string
  meetingLink: string
  instructorEmail: string
  online: boolean
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const user = verifyAuthenticated(locals)
    const body = (await request.json()) as EnrollRequestBody

    const classTimes: string[] = body.classTimes
    const classDays: string[] = body.classDays
    const classes = classDays.map(
      (day, index) => `${day} at ${formatTime24to12(classTimes[index])}`,
    )
    const class1Time = classes[0]
    const class2Time = classes[1]

    const template = {
      name: 'interviewScheduled',
      data: {
        subject: `${body.course} class details for ${body.studentName}`,
        app: {
          name: 'Portal',
          link: 'https://portal.gbstem.org',
          instructor: body.instructor,
          firstName: body.firstName,
          class1Time: class1Time,
          class2Time: class2Time,
          meetingLink: body.meetingLink,
          course: body.course,
          instructorEmail: body.instructorEmail,
          online: body.online,
          studentName: body.studentName,
        },
      },
    }

    const htmlBody = renderEmail(
      body.online
        ? 'onlineClassEnrolledEmailTemplate'
        : 'inPersonClassEnrolledEmailTemplate',
      template.data,
    )

    try {
      await sendEmail({
        to: user.email,
        cc: body.instructorEmail,
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
    throw handleApiError('/api/enroll', err)
  }
}
