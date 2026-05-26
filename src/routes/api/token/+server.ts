import type { RequestHandler } from '@sveltejs/kit';
import { VITE_CLIENT_ID, VITE_CLIENT_SECRET } from '$env/static/private';

export const POST: RequestHandler = async (): Promise<Response> => {
  try {
    const response = await fetch('https://login.microsoftonline.com/c9f983d8-6c86-4534-8471-99c48eaab882/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'client_id': VITE_CLIENT_ID,
        'scope': 'https://graph.microsoft.com/.default',
        'client_secret': VITE_CLIENT_SECRET,
        'grant_type': 'client_credentials'
      }).toString()
    }).then(res => res.json());
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Allow all origins
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', // Allow specific methods
        'Access-Control-Allow-Headers': 'Content-Type' // Allow specific headers
      },
    })

  } catch (err) {
    return new Response(JSON.stringify(err), {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*', // Allow all origins
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', // Allow specific methods
          'Access-Control-Allow-Headers': 'Content-Type' // Allow specific headers
        },
      })
  }
};

export const OPTIONS: RequestHandler = async (): Promise<Response> => {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Allow all origins
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', // Allow specific methods
        'Access-Control-Allow-Headers': 'Content-Type' // Allow specific headers
      }
    })
  };
