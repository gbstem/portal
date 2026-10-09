import { verifyInstructor } from '#lib/server/apiHelpers.js'
import { communityServiceSummary } from '#lib/server/communityService.js'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const user = verifyInstructor(locals)
  return { summary: await communityServiceSummary(user.uid) }
}
