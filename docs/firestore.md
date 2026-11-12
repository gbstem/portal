# Firestore access

- `src/lib/client/firebase.ts` → client SDK, used in `.svelte` components, gated by shared `firestore.rules`.
- `src/lib/server/firebase.ts` → Admin SDK, used only in `hooks.server.ts`, `src/routes/api/*/+server.ts` and `+page.server.ts` loads/actions, guarded with `verifyAuthenticated(locals)` and `try { ... } catch (err) { throw handleApiError(err) }` (`src/lib/server/apiHelpers.ts`).
- Some client code imports request/response types straight from a route's `+server.ts` (e.g. `SignupRequestBody`) via relative paths rather than duplicating the type — keep doing this instead of redefining server payload shapes client-side.

## Guarding API routes

`src/lib/server/apiHelpers.ts` also exports `verifyInstructor(locals)` (401 unsigned, 403 for anyone else). Reach for it, not `verifyAuthenticated`, on any endpoint that exposes something about _another_ user — an `/api/*` route sits outside the route-group layouts, so without it every signed-in student can call it. Its counterpart `verifyStudent(locals)` is for a parent account acting on its own students' registrations, which `#lib/server/classEnrollments`'s `isOwnRegistration` then scopes to the caller.

## Writes that have to agree go in one atomic write

When an operation changes more than one document that must stay consistent, use a `writeBatch` for blind writes and a transaction when a write is computed from something read (`#lib/server/classFeedback`, `#lib/server/classEnrollments`, `#lib/server/substituteSessions`). Sequential `await`s leave half the change behind whenever a later one fails, and a batch built from a read made outside it overwrites whatever changed in between.

## Email addresses are resolved from uids

**A view that shows another person's email address resolves it through `/api/resolveEmails`**, never from a copy stored on a document, which goes stale when its owner changes their account email. Each use case is an _intent_ in `#lib/server/emailIntents.ts`, whose policy reads a context document (a class, a sub request, ...) to decide which uids this caller may resolve. The client reaches it through a task-named wrapper in the service that owns the view's data (`classService.fetchEnrolledClassInstructorEmail`). Add an intent there rather than a new endpoint.

The route, `#lib/server/accountEmails.ts` and `#lib/services/accountEmailService.ts` are byte-identical with admin's; `emailIntents.ts` is not.

Applications and registrations still store `personal.email`, but only as an audit record of the submitting account's address, written on every save and never read (resolve the applicant from the application id, the parent from the registration key via `registrationParentUid`); only a registration's `personal.secondaryEmail`, a second guardian's typed address with no Auth account behind it, is read.
