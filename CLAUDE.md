@AGENTS.md

# Codebase Conventions for AI Assistants

Read [README.md](README.md) first (architecture, setup, shared Firebase emulator). This file holds the rules every change must follow; the `docs/` pages it links hold the details and the reasons, so open one when your task touches its subject.

## Tightly coupled with `../admin`

Portal and admin share one Firebase project, one Firestore database and one `firestore.rules`. **Portal only ever reads and writes the current semester** (`withSemester()` always stamps `currentSemester`). `collections.ts`, `semesterDates.json` and `courses.json` are copied from admin at rollover, so never hand-edit them; `src/lib/shared/` is identical in both repos. If you change any of these or a security rule, make the matching change in `../admin`. **Ship it as two PRs on branches of the same name**: portal's e2e job seeds the emulator from the same-named admin branch (and Cypress needs a sibling `../admin` checkout). Before writing a helper that isn't specific to portal, look in `src/lib/shared/` first. Details, including why course ids are case-sensitive and half-year specific: [docs/cross-repo.md](docs/cross-repo.md).

## Route groups are auth gates, not just folders

- `(signedIn)/+layout.server.ts` redirects to `/signin` if `locals.user === null`.
- `(signedIn)/(emailVerified)/+layout.server.ts` additionally redirects to `/profile` if the email isn't verified.
- `locals.user` is populated in `src/hooks.server.ts` via `adminAuth.verifySessionCookie`; only `student`/`instructor` custom-claim roles are accepted — other roles are redirected to `admin.gbstem.org`.
- **New protected page → put it under `src/routes/(signedIn)/(emailVerified)/<name>/+page.svelte`.** Don't add manual auth checks; the layout hierarchy already gates it.

## Svelte 5 runes, callback props, snippets

- Runes mode throughout: `$props()`/`$state`/`$derived`/`$bindable`. `$effect` is for side effects only. **A value derived from other state uses `$derived`/`$derived.by`, never an `$effect` that copies one piece of state into another** (the guard-variable hack this codebase spent real effort removing).
- Component "events" are callback props (`onclick`, `onSubmit`, ...), not `createEventDispatcher`/`on:*`. Use snippets (`{#snippet}`, `children: Snippet`), not `<slot />`.
- Shared state lives in rune-backed `.svelte.ts` modules (`src/lib/stores.svelte.ts`), not `svelte/store`. The one exception is the `user` store in `src/lib/client/firebase.ts`, kept as a `svelte/store` because module-level `$state` would leak between SSR requests.
- Use `$app/state` (`page`, `navigating`), not `$app/stores` (removed in SvelteKit 3). `navigating` is always truthy: check `navigating.to`/`navigating.type`.

## Forms

New and migrated forms use **server-side form actions** (as `/apply` does): a `load` returning `superValidate(...)`, named actions, a draft schema kept in step with the full one by a parity test, and `invalidateAll: false`. Other forms are legacy SPA Superforms writing with the client SDK. A save that touches another user's data, or must change two documents together, posts to an `/api/*` route instead. Schemas live in `src/lib/components/forms/schemas.ts`. Details: [docs/forms.md](docs/forms.md).

## Firestore access

- `src/lib/client/firebase.ts` is the client SDK, gated by `firestore.rules`. `src/lib/server/firebase.ts` is the Admin SDK, used only in `hooks.server.ts`, `src/routes/api/*/+server.ts` and `+page.server.ts`.
- API routes: wrap the body in `try { ... } catch (err) { throw handleApiError(err) }` and guard with `src/lib/server/apiHelpers.ts`. **Use `verifyInstructor`, not `verifyAuthenticated`, on any route exposing another user's data**: `/api/*` sits outside the route-group layouts. `verifyStudent` is for a parent acting on their own registrations.
- **Writes that have to agree go in one `writeBatch`/transaction**, never sequential awaits.
- **Another person's email address is resolved through `/api/resolveEmails`** (an intent in `#lib/server/emailIntents.ts`), never read from a document.
- Import request/response types from a route's `+server.ts` rather than redefining them client-side.

Details: [docs/firestore.md](docs/firestore.md).

## Roles come from the Auth claim, and signup does not pick one

- A role is the Firebase Auth custom claim only (`locals.user.role` on the server, `page.data.user.role` in components). **Never put a role in a Firestore document.**
- `/api/signup`'s `roleForSignup` is the only place a role is assigned. `/api/auth` must not fall back to a users document. Code that changes a role must force `getIdToken(true)` afterwards.
- `instructor` means "applied to teach"; `isAcceptedInstructor(uid)` means "teaches". Every instructor write is an API route checked with the Admin SDK: add a route rather than opening a rule.
- Co-instructors are `otherInstructorUids`, accepted instructors only, added through `/api/classDetails`. **Never take a co-instructor email from the client.**

Details: [docs/roles.md](docs/roles.md).

## Document upload is dead code

README mentions "upload/parse documents", but no upload UI is wired up: `Input.svelte` supports `type="file"` unused, and the only Storage code left is cleanup in `DeleteAccountForm.svelte`. If asked to touch resume/document upload, ask the user whether to resurrect the removed feature or build one new; don't assume the scaffolding is complete.

## Icons come from Heroicons, not pasted `<svg>`s

`<Icon src={XMark} class="h-5 w-5" />` from `@steeze-ui/heroicons` + `@steeze-ui/svelte-icon` (`theme="mini"` for the 20px solid set). `#lib/components/icons/` holds only glyphs Heroicons lacks. **Never paste a new `<svg>`.** Keep one glyph per idea: check what the app already uses for a concept. Admin follows the same convention.

## Types

Shared types live in a global ambient `Data` namespace in `src/data.d.ts` (e.g. `Data.Application`, `Data.User.Profile`, `Data.Role`, `Data.Token<'client'|'server'|'pojo'>`), usable unimported anywhere. `tsconfig.json` sets `strict`, `verbatimModuleSyntax` and `checkJs`.

## Testing

Jest, one `<module>.test.ts` per `src/lib` module under `__tests__/`. Firestore (`firebase/firestore` and `firebase-admin/firestore`) is mocked with hand-rolled `DocumentReference`/`Query`/`CollectionReference` classes, so no emulator is needed for unit tests. `collections.test.ts` validates `semesterDates.json` format/year rather than hitting Firestore.
