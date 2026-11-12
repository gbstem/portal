# Forms: server-side actions (new) and SPA Superforms (legacy)

## Server-side form actions

**Forms are moving to server-side form actions; `/apply`'s two are done.** `/apply`'s `+page.server.ts` loads with the Admin SDK and exposes `saveApplication`/`submitApplication` (ApplyForm, via `#lib/server/instructorApplication`) and `saveRegistration`/`submitRegistration` (RegistrationForm, via `#lib/server/studentRegistration`). Those modules validate against the schema, enforce the window (`#lib/server/semesterWindows`) and the after-submit lock, write, and send the confirmation email. Those checks used to live only in the browser, where anyone could skip them.

A parent's registrations are addressed by child number (`/apply?child=N`, and `&child=N` on the action URL), never by document id: the server builds the id from the caller's own uid.

New and migrated forms follow that shape:

- a `load` that returns `superValidate(...)`;
- named actions;
- a lenient draft schema kept in step with the full one by a parity test in `schemas.test.ts`;
- `invalidateAll: false`, so a re-run `load` can't overwrite fields typed while a save was in flight.

`firestore.rules` gives applicants and parents no write access to `applications` or `registrations`, so these actions are the only way either changes; a form migrated this way should take its collection's client write access away too.

## SPA Superforms (legacy)

Every other form still runs Superforms in `SPA: true` mode (see `ChangeNameForm.svelte`): `onUpdate` calls `setDoc(doc(db, collection, id), withSemester(values))` directly against the client Firestore SDK, then optionally hits a plain `/api/*/+server.ts` endpoint only for side effects that need the Admin SDK (e.g. sending email). Schemas live in `src/lib/components/forms/schemas.ts`. Field wrapper components (`FormInput`, `FormSelect`, `FormCheckbox`, `FormTextarea`) wrap the `superForm` `form` object; errors surface via `alert.trigger('error', ...)`.

No instructor form or button writes Firestore from the browser any more (see [roles.md](roles.md)). The exception for everyone is:

- **A save that also changes another user's data posts to an `/api/*` route.** `ClassDetailsForm` saves through `/api/classDetails`, because a class save decides who teaches the class, which only the server can check.
- **A write that has to change two documents together goes through a route that does it in one Firestore transaction.** Enrolling a student adds them to the class's `students` _and_ the class to their registration, so the classes page calls `/api/enroll`. Two client writes there let an enrollment reach the registration and never the roster, spots remaining or reminders that read the class, since `firestore.rules` refuses the class half to every parent.
