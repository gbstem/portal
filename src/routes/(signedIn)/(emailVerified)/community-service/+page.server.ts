import { verifyInstructor } from '$lib/server/apiHelpers'
import { communityServiceSummary } from '$lib/server/communityService'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = verifyInstructor(locals)
  return { summary: await communityServiceSummary(user.uid) }
}
