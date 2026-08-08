import { handleApiError, verifyAuthenticated } from '$lib/server/apiHelpers'
import { VITE_CLIENT_ID, VITE_CLIENT_SECRET } from '$env/static/private'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ locals }) => {
  try {
    verifyAuthenticated(locals)

    try {
      const response = await fetch(
        'https://login.microsoftonline.com/c9f983d8-6c86-4534-8471-99c48eaab882/oauth2/v2.0/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: VITE_CLIENT_ID,
            scope: 'https://graph.microsoft.com/.default',
            client_secret: VITE_CLIENT_SECRET,
            grant_type: 'client_credentials',
          }).toString(),
        },
      ).then((res) => res.json())

      return json(response)
    } catch (tokenError) {
      return json(
        { error: 'Failed to fetch access token. Please try again later.' },
        { status: 500 },
      )
    }
  } catch (err) {
    throw handleApiError('/api/token', err)
  }
}
