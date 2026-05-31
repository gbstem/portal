import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { adminAuth } from '$lib/server/firebase'
import type { FirebaseError } from 'firebase-admin'
import { SENDGRID_API_TOKEN } from '$env/static/private'
import { addDataToHtmlTemplate } from '$lib/utils'
import { actionEmailTemplate } from '$lib/data/emailTemplates/actionEmailTemplate'
import MailService, { type MailDataRequired } from '@sendgrid/mail'

export const POST: RequestHandler = async ({ request, locals }) => {
  let topError
  try {
    const body = await request.json()
    let to
    let data!: {
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
    try {
      switch (body.type) {
        case 'verifyEmail': {
          let email: string
          if (locals && 'user' in locals) {
            if (locals.user === null) {
              throw 'User not signed in.'
            } else {
              email = locals.user.email
            }
          } else {
            email = body.email
          }
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
          if (locals.user === null) {
            throw 'User not signed in.'
          }
          if (body.newEmail) {
            const link = await adminAuth.generateVerifyAndChangeEmailLink(
              locals.user.email,
              body.newEmail,
            )
            to = body.newEmail
            data = {
              subject: 'Change Email for gbSTEM Account',
              name: firstName,
              action: {
                link,
                name: 'Change Email',
                description: `Please confirm that you want to change your email from ${locals.user.email} to ${body.newEmail} by clicking the button below.`,
              },
            }
          } else {
            topError = error(400, 'Invalid request body.')
          }
          break
        }
        case 'resetPassword': {
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
          topError = error(400, 'Invalid action type.')
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

      // get html template from firebase

      const htmlBody = addDataToHtmlTemplate(actionEmailTemplate, template)

      const emailData: MailDataRequired = {
        from: 'donotreply@gbstem.org',
        to: to,
        cc: '',
        subject: String(template.data.subject),
        html: htmlBody,
        replyTo: 'contact@gbstem.org',
        text: 'Action Required',
      }

      MailService.setApiKey(SENDGRID_API_TOKEN)
      try {
        await MailService.send(emailData)
        console.log('Email sent')
      } catch (mailError) {
        console.error('Error sending email:', mailError)
        return json(
          { error: 'Failed to send email. Please try again later.' },
          { status: 500 },
        )
      }
      return json({ message: 'Email sent successfully.' })
    } catch (err) {
      if (typeof err === 'string') {
        topError = error(400, err)
      } else {
        const typedErr = err as
          | FirebaseError
          | {
              errorInfo: FirebaseError
              codePrefix: string
            }
        if ('errorInfo' in typedErr) {
          topError = error(
            400,
            typedErr.errorInfo.message ||
              'Please wait a few minutes before trying again.',
          )
        } else if ('message' in typedErr) {
          topError = error(400, typedErr.message)
        } else {
          topError = error(400, 'Something went wrong. Please try again.')
        }
      }
    }
  } catch (err) {
    topError = error(400, 'Invalid request body.')
  }
  throw topError
}
