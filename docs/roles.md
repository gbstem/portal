# Roles, signup and co-instructors

See admin's README "Roles and Authorization" for the whole picture across both sites.

## Roles come from the Auth claim

A user's role is the Firebase Auth **custom claim**, and there is no other copy of it: `users/{uid}` holds `firstName`/`lastName` only, so the `user` store's `profile` carries no role. `hooks.server.ts` reads the claim off the Auth record per request, and `verifyInstructor` reads `locals.user.role`. On the client, pages and components read that same value as `page.data.user.role` (from `$app/state`), which `(signedIn)/+layout.server.ts` provides on the first render.

**Don't put a role back in a Firestore document**, not even "for display": when a `users/{uid}.role` existed, `Nav.svelte` and `/apply` read it while the API gates read the claim, so 521 accounts whose two copies disagreed saw instructor pages that every instructor route then refused.

## Signup does not pick a role

`userService.createUser` creates the Auth account and nothing else. The profile document (name only) and the claim are written together by `/api/signup`, whose `roleForSignup` is the single place role assignment is decided — the form only reports what the person said they were there to do. `/api/auth` is claim-only and refuses an account with no claim; **do not reintroduce a users-document fallback there**, that fallback is how a browser-chosen role became a real custom claim.

`SignUpForm`'s `createProfile` ends with `getIdToken(true)`. That forced refresh is required, not defensive: rules read `request.auth.token`, and the client's token predates the claim, so without it a new instructor gets ~1h of silent permission-denied. Any future code that changes a role owes the same refresh.

## `instructor` means "applied to teach"

It is granted at signup, before any interview. `isAcceptedInstructor(uid)` in `src/lib/server/instructorDirectory.ts` is what means "teaches". `firestore.rules` has no such check because it grants instructors no writes beyond their own name. Every instructor write is an API route that checks the caller with the Admin SDK and writes with it:

- class details: `/api/classDetails`
- the schedule and holding a session: `/api/classSchedule`
- filing, editing and cancelling a sub request: `/api/subRequest`
- claiming one: `/api/substitute`
- booking, rescheduling or cancelling an interview: `/api/interview`
- painting their availability: `/api/availability`

Add a route like those rather than reopening a rule.

## Co-instructors are uids, and only accepted instructors

Classes store co-instructors as `otherInstructorUids: string[]`. There is deliberately no email equivalent: a free-text `otherInstructorEmails` string honoured directly by `firestore.rules`'s `isInstructorOfClass()` let a class owner type any address at all and hand that person write access.

gbSTEM leadership's rule is that nobody teaches a class they weren't interviewed and accepted for, so a uid only gets onto a class through `/api/classDetails`, which saves the class with the Admin SDK and refuses any newly added uid unless the account holds the `instructor` role **and** has an `accepted` decision (`decisions/{uid}.type`) — the same test `/api/lookupCoInstructor` applies when the form resolves a typed address. The role claim alone means nothing here, since it is set at signup, long before any interview.

**Never add a code path that takes a co-instructor email from the client.** Co-instructor uid→identity resolution goes through `src/lib/server/instructorDirectory.ts`, which drops uids whose Auth account is gone; `/api/remindStudents` takes uids and resolves the cc list itself. `/api/lookupCoInstructor` returns the _same_ message for every rejection reason on purpose — distinguishing them would leak whether an address has a gbSTEM account and how that person's application went.
