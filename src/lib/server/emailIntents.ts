import { classesCollection } from '$lib/data/collections'
import { isOwnRegistration } from '$lib/server/classEnrollments'
import { adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'
import { z } from 'zod'

/**
 * Which accounts' current email addresses a caller may look up through
 * /api/resolveEmails, and why.
 *
 * A request names an intent (the view or task it is for), the uids it wants,
 * and a context: the document that relates the caller to those uids. The
 * intent's policy reads that document with the Admin SDK and returns the uids
 * the caller may resolve under it. The whole request is refused unless the
 * caller's role is one the intent allows and every requested uid is one the
 * policy returned. Naming a uid proves nothing - uids are not secret, class
 * documents are readable by every signed-in user - so the policy, not the
 * request, decides whose address comes back.
 *
 * A policy should grant no more than its view showed back when it read the
 * address straight off a document. See notes/EMAIL_TO_UID_AUDIT.md, Phase 5
 * item 4.
 *
 * To add a use case: add its request shape to `resolveEmailsSchema` and its
 * policy to `policies` (which won't typecheck until both exist), then give the
 * client service that owns the view's data a task-named wrapper around
 * `accountEmailService.resolveEmails`. Admin keeps its own copy of this file
 * with admin's intents; the route and the Auth lookup are shared verbatim.
 */

/**
 * Per request. Auth caps a uid at 128 characters, and a longer one would fail
 * the whole batched lookup rather than just itself.
 */
const MAX_UIDS = 500
const uids = z.array(z.string().min(1).max(128)).min(1).max(MAX_UIDS)

export const resolveEmailsSchema = z.discriminatedUnion('intent', [
  // The classes page's "Contact Instructor" link, which a parent sees on each
  // class one of their students is enrolled in.
  z.object({
    intent: z.literal('enrolledClassInstructor'),
    uids,
    context: z.object({ classId: z.string().min(1) }),
  }),
])

export type ResolveEmailsRequestBody = z.infer<typeof resolveEmailsSchema>

type Intent = ResolveEmailsRequestBody['intent']
type ContextFor<I extends Intent> = Extract<
  ResolveEmailsRequestBody,
  { intent: I }
>['context']

interface IntentPolicy<I extends Intent> {
  /** The roles that may make this request at all. */
  roles: readonly Data.Role[]
  /** The uids `caller` may resolve under `context`; empty if it grants none. */
  resolvableUids(
    caller: Data.User.Peek,
    context: ContextFor<I>,
  ): Promise<string[]>
}

const policies: { [I in Intent]: IntentPolicy<I> } = {
  enrolledClassInstructor: {
    roles: ['student'],
    // The class's primary instructor, to a parent with a student on its
    // roster - the roster, not the registration, because it is what
    // /api/enroll's transaction and every reminder treat as enrollment.
    // Co-instructors are left out: the page has never shown them.
    async resolvableUids(caller, { classId }) {
      const snap = await adminDb.doc(`${classesCollection}/${classId}`).get()
      const classData = snap.data() as Data.Class | undefined
      if (!classData?.instructorUid) return []
      const enrolled = (classData.students ?? []).some((studentUid) =>
        isOwnRegistration(caller.uid, studentUid),
      )
      return enrolled ? [classData.instructorUid] : []
    },
  },
}

/**
 * The one message for every refusal - wrong role, a context document that is
 * missing or grants nothing, or a uid it doesn't cover - so a refusal can't
 * be used to probe which classes exist or whom they're taught by.
 */
export const EMAIL_LOOKUP_REFUSED =
  'You are not allowed to look up those email addresses.'

/**
 * Throws a 403 unless `caller` may resolve every uid in `request`.
 */
export async function authorizeEmailResolution(
  caller: Data.User.Peek,
  request: ResolveEmailsRequestBody,
): Promise<void> {
  const policy = policies[request.intent] as IntentPolicy<Intent>
  const allowed = new Set(
    policy.roles.includes(caller.role)
      ? await policy.resolvableUids(caller, request.context)
      : [],
  )
  if (request.uids.some((uid) => !allowed.has(uid))) {
    console.warn(
      `[API /api/resolveEmails] refused ${request.intent} for uid ${caller.uid}`,
    )
    throw error(403, EMAIL_LOOKUP_REFUSED)
  }
}
