import { clearSentEmails, getSentEmails } from '$lib/server/email'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

function assertTestEnvironment() {
  if (process.env.NODE_ENV === 'production') {
    throw error(403, 'Test endpoint unavailable in production.')
  }
}

export const GET: RequestHandler = async () => {
  assertTestEnvironment()
  return json(getSentEmails())
}

export const DELETE: RequestHandler = async () => {
  assertTestEnvironment()
  clearSentEmails()
  return json({ message: 'Sent emails cleared.' })
}
