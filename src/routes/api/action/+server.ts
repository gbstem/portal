import { actionEmailTemplate } from '$lib/data/emailTemplates/actionEmailTemplate'
import { verifyAuthenticated, handleApiError } from '$lib/server/apiHelpers'
import { sendEmail } from '$lib/server/email'
import { adminAuth } from '$lib/server/firebase'
import { addDataToHtmlTemplate } from '$lib/utils'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export interface ActionRequestBody {
  type: 'verifyEmail' | 'changeEmail' | 'resetPassword'
  email?: string
  newEmail?: string
  firstName?: string
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = (await request.json()) as ActionRequestBody
    let to = ''
    let data: {
      subject: string
      name?: string
      action: {
        link: string
        name: string
        firstName?: string
        description: string
      }
    }

    const firstName = body.firstName

    switch (body.type) {
      case 'verifyEmail': {
        const user = verifyAuthenticated(locals)
        const email = user.email
        const link = await adminAuth.generateEmailVerificationLink(email)
        to = email
        data = {
          subject: 'Verify Email for gbSTEM Account',
          action: {
            link,
            name: 'Verify Email',
            firstName: firstName,
            description:
              'Please verify your email for your gbSTEM account by clicking the button below.',
          },
        }
        break
      }
      case 'changeEmail': {
        const user = verifyAuthenticated(locals)
        if (!body.newEmail) {
          throw error(400, 'Invalid request body.')
        }
        const link = await adminAuth.generateVerifyAndChangeEmailLink(
          user.email,
          body.newEmail,
        )
        to = body.newEmail
        data = {
          subject: 'Change Email for gbSTEM Account',
          name: firstName,
          action: {
            link,
            name: 'Change Email',
            description: `Please confirm that you want to change your email from ${user.email} to ${body.newEmail} by clicking the button below.`,
          },
        }
        break
      }
      case 'resetPassword': {
        if (!body.email) {
          throw error(400, 'Email is required for password reset.')
        }
        const link = await adminAuth.generatePasswordResetLink(body.email)
        to = body.email
        data = {
          subject: 'Reset Password for gbSTEM Account',
          action: {
            link,
            name: 'Reset Password',
            description:
              'Please reset your password for your gbSTEM account by clicking the button below.',
          },
        }
        break
      }
      default: {
        throw error(400, 'Invalid action type.')
      }
    }

    const template = {
      name: 'action',
      data: {
        ...data,
        app: {
          name: 'Portal',
          link: 'https://portal.gbstem.org',
        },
      },
    }

    const htmlBody = addDataToHtmlTemplate(actionEmailTemplate, template)

    try {
      await sendEmail({
        to: to,
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
    throw handleApiError(err)
  }
}
