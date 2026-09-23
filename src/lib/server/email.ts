import { SENDGRID_API_TOKEN } from '$env/static/private'
import MailService, { type MailDataRequired } from '@sendgrid/mail'

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  cc?: string | string[]
  replyTo?: string
}

/**
 * Every gbSTEM email is sent from this address, and replies go to
 * `contact@gbstem.org` unless the caller routes them somewhere better - a
 * class's instructor, say. Named constants because the simulated send records
 * them too: a recorded email that omitted the fields SendGrid is handed would
 * make an e2e test asserting them pass or fail on the recorder's shape rather
 * than on what would actually have been sent.
 */
const FROM_ADDRESS = 'donotreply@gbstem.org'
const DEFAULT_REPLY_TO = 'contact@gbstem.org'

// Support for recording and retrieving emails in-memory for Cypress e2e
// tests in environments where SendGrid is not configured, like CI.
export interface SentEmail {
  from: string
  to: string[]
  subject: string
  html: string
  cc?: string[]
  replyTo: string
  timestamp: number
}

export const sentEmails: SentEmail[] = []

export function getSentEmails(): SentEmail[] {
  return sentEmails
}

export function clearSentEmails(): void {
  sentEmails.length = 0
}

function parseEmails(emails: string | string[]): string[] {
  if (Array.isArray(emails)) {
    return emails.map((e) => e.trim()).filter(Boolean)
  }
  return emails
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
}

/**
 * Sends an email using SendGrid. If SENDGRID_API_TOKEN is not set,
 * it simulates the email send and logs a warning.
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const { to, subject, html, cc, replyTo } = options

  const toEmails = parseEmails(to)
  const toStr = toEmails.join(', ')

  if (
    !SENDGRID_API_TOKEN ||
    SENDGRID_API_TOKEN ===
      'SG.abcdefghijklmnopqrstuvwxyz.1234567890abcdefghijklmnopqrstuvwxyz'
  ) {
    const record: SentEmail = {
      from: FROM_ADDRESS,
      to: toEmails,
      subject,
      html,
      // Recorded the way the real send resolves it, not the way it was
      // passed: an absent replyTo becomes the default address downstream.
      replyTo: replyTo || DEFAULT_REPLY_TO,
      timestamp: Date.now(),
    }
    if (cc) {
      const ccEmails = parseEmails(cc)
      if (ccEmails.length > 0) record.cc = ccEmails
    }
    sentEmails.push(record)

    console.warn("SENDGRID_API_TOKEN isn't set. Email sends are simulated.")
    console.log(`Email sent to: ${toStr} | Subject: ${subject}`)
    return
  }

  MailService.setApiKey(SENDGRID_API_TOKEN)

  const emailData: MailDataRequired = {
    from: FROM_ADDRESS,
    to: toEmails,
    subject,
    html,
    replyTo: replyTo || DEFAULT_REPLY_TO,
  }

  if (cc) {
    const ccEmails = parseEmails(cc)
    if (ccEmails.length > 0) {
      emailData.cc = ccEmails
    }
  }

  try {
    await MailService.send(emailData)
    console.log(`Email sent to: ${toStr} | Subject: ${subject}`)
  } catch (error) {
    console.error(
      `Error sending email to ${toStr} | Subject: ${subject},`,
      error,
    )
    throw error
  }
}
