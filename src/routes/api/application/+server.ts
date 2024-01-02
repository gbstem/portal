import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { adminDb } from '$lib/server/firebase'
import postmark from 'postmark'
import {
  POSTMARK_API_TOKEN,
} from '$env/static/private'
import { addDataToHtmlTemplate } from '$lib/utils'

export const POST: RequestHandler = async ({ locals }) => {
  if (locals.user === null) {
    throw error(400, 'User not signed in.')
  } else {
    const template = {
      name: 'applicationSubmitted',
      data: {
        subject: 'Next steps for your gbSTEM application',
        app: {
          name: 'Portal',
          link: 'https://portal.gbstem.org',
        },
      },
    }
    const document = await adminDb.collection('templates').doc(template.name).get()

    const htmlBody = addDataToHtmlTemplate(document.data()?.html, template);

    const emailData: Data.EmailData = {
      From: 'donotreply@gbstem.org',
      To: locals.user.email,
      Cc: '',
      Subject: String(template.data.subject),
      HTMLBody: htmlBody,
      ReplyTo: 'contact@gbstem.org',
      MessageStream: 'outbound'
    }
    try {
      const client = new postmark.ServerClient(POSTMARK_API_TOKEN);
      client.sendEmail(emailData);

      return new Response()
    } catch (err) {
      throw error(400, 'Failed to send email.')
    }
  }
}
