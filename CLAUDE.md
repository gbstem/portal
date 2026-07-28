@AGENTS.md

# Codebase Conventions for AI Assistants

This supplements [README.md](README.md) (architecture, setup, shared Firebase emulator) with code-level conventions the README doesn't cover. Read the README first.

> **Note:** [AGENTS.md](AGENTS.md) in this repo is a near-verbatim copy of the admin repo's. Everything in it (npm, Jest, Cypress, lint/test-before-done) still applies here.`

## Tightly coupled with `../admin`

Portal and admin share the **same Firestore database and Firebase project** and the same shape of `src/lib/data/collections.ts`. Unlike admin (which can browse past semesters), **portal only ever reads and writes the current semester** — `withSemester()` here always stamps `currentSemester` with no override, since there's no `?semester=` browsing UI. The `currentSemester` suffix and `semesterDates.json` in this repo are copied by hand from admin's copy during a semester rollover (see admin's README "Adding a New Semester") — **update both repos together**, and update Firestore security rules identically in both since they're merged by hand for production. Cypress e2e tests here also expect a sibling `../admin` checkout (used to seed the shared emulator) — see README's Cypress section.

## Route groups are auth gates, not just folders

- `(signedIn)/+layout.server.ts` redirects to `/signin` if `locals.user === null`.
- `(signedIn)/(emailVerified)/+layout.server.ts` additionally redirects to `/profile` if the email isn't verified.
- `locals.user` is populated in `src/hooks.server.ts` via `adminAuth.verifySessionCookie`; only `student`/`instructor` custom-claim roles are accepted — other roles are redirected to `admin.gbstem.org`.
- **New protected page → put it under `src/routes/(signedIn)/(emailVerified)/<name>/+page.svelte`.** Don't add manual auth checks; the layout hierarchy already gates it.

## Svelte 5 runes, callback props, snippets

`package.json` pins `svelte@^5` and the codebase is written in runes mode: `$props()`/`$state`/`$derived`/`$bindable` for component state, `$effect` for side effects (never for syncing state that is also read in the same effect — see below). Component "events" are plain callback props (`onclick`, `onSubmit`, `onCancel`, ...), not `createEventDispatcher`/`on:*`. Use snippets (`{#snippet ...}` / `children: Snippet`) instead of `<slot />`. Shared cross-component state lives in rune-backed `.svelte.ts` modules (see `src/lib/stores.svelte.ts`), not `svelte/store` — the one deliberate exception is `src/lib/client/firebase.ts`'s `user` store, which stays a `svelte/store` on purpose because module-level `$state` would leak between requests during SSR. Navigation/page info comes from `$app/state` (`page`, `navigating`), not the deprecated `$app/stores`; note `navigating` is always truthy there — check `navigating.to`/`navigating.type`, not `if (navigating)`.

When a value is derived from other reactive state, use `$derived`/`$derived.by` — don't reach for `$effect` to "copy" one piece of state into another; that's the guard-variable-hack shape this codebase spent real effort removing.

## Forms: SPA Superforms writing straight to Firestore

There are **no `+page.server.ts` form actions anywhere in this repo**. Every form runs Superforms in `SPA: true` mode (see `ApplyForm.svelte`): `onUpdate` calls `setDoc(doc(db, collection, id), withSemester(values))` directly against the client Firestore SDK, then optionally hits a plain `/api/*/+server.ts` endpoint only for side effects that need the Admin SDK (e.g. sending email). Schemas live in `src/lib/components/forms/schemas.ts`. Field wrapper components (`FormInput`, `FormSelect`, `FormCheckbox`, `FormTextarea`) wrap the `superForm` `form` object; errors surface via `alert.trigger('error', ...)`.

## Firestore access

- `src/lib/client/firebase.ts` → client SDK, used in `.svelte` components, gated by shared `firestore.rules`.
- `src/lib/server/firebase.ts` → Admin SDK, used only in `hooks.server.ts` and `src/routes/api/*/+server.ts`, guarded with `verifyAuthenticated(locals)` and `try { ... } catch (err) { throw handleApiError(err) }` (`src/lib/server/apiHelpers.ts`).
- A cross-cutting idiom worth preserving: some client code imports request/response types straight from a route's `+server.ts` (e.g. `ApplicationRequestBody`) via relative paths rather than duplicating the type — keep doing this instead of redefining server payload shapes client-side.

## Document upload feature is partially dead code

The README describes "upload/parse documents," but there's no live upload UI currently wired up — `src/lib/components/Input.svelte` supports `type="file"` generically but nothing in the current form set uses it, and the only Storage reference left is cleanup code in `DeleteAccountForm.svelte` (`deleteObject(ref(storage, 'resumes/${uid}.pdf'))`). If asked to touch resume/document upload, confirm with the user whether you're resurrecting a removed feature or building one net-new — don't assume existing scaffolding is more complete than it is.

## Types

Shared types live in a global ambient `Data` namespace in `src/data.d.ts` (e.g. `Data.Application`, `Data.User.Profile`, `Data.Role`, `Data.Token<'client'|'server'|'pojo'>`) — usable unimported anywhere. `tsconfig.json` sets `strict: true`, `verbatimModuleSyntax: true`, and `checkJs: true`.

## Testing

Jest, one `<module>.test.ts` per `src/lib` module under `__tests__/`. Firestore (`firebase/firestore` and `firebase-admin/firestore`) is mocked with hand-rolled `DocumentReference`/`Query`/`CollectionReference` classes — no emulator needed for unit tests. `collections.test.ts` validates `semesterDates.json` format/year rather than hitting Firestore.
