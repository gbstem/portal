# ApplyForm autosave race can scramble in-progress typing

**Status:** Not fixed. Documented here after being caught indirectly by a Cypress test; the test now waits around it instead of the form being made race-proof.

## Summary

`ApplyForm.svelte` (`src/lib/components/forms/ApplyForm.svelte`) kicks off an
async save on mount, and that save eventually reassigns the whole `values`
object the form's inputs are bound to. If a user starts typing before that
save finishes, their keystrokes can land on an input that gets swapped out
from under them mid-type, silently dropping or corrupting characters.

This isn't hypothetical: a Cypress test (`cypress/e2e/instructor.cy.ts`, Test
Case 8) reproduced it directly. Typing `5559876543` into the phone number
field landed as `55398` when the test didn't pad extra time after page load
before typing.

## Root cause

`onMount` (`ApplyForm.svelte:132-177`) subscribes to the user store and, for
a new or normalized application, calls `handleSave()` without awaiting it
(`ApplyForm.svelte:148-157`):

```js
values = normalizeApplicationData(values, user.object, user.profile)
handleSave()
// ...
values = normalizeApplicationData(null, user.object, user.profile)
handleSave()
```

`handleSave()` (`ApplyForm.svelte:184-235`) sets `saving = true`, awaits a
Firestore write and then a re-fetch, and only then does this
(`ApplyForm.svelte:224-228`):

```js
if (applicationData) {
  values = cloneDeep(applicationData)
  dbValues = cloneDeep(applicationData)
}
saving = false
```

`values = cloneDeep(applicationData)` replaces the entire bound object right
before `saving` flips back to `false`. Every field bound into that object
(via `FormInput`/`FormSelect`/etc.) is a candidate for losing its DOM node
identity at that moment.

The form's only guard against interacting too early is the `saving` flag
(`ApplyForm.svelte:318`):

```js
disabled={values.meta.submitted || $submitting || saving}
```

`saving` is `false` in two very different situations that look identical
from the outside: **before** the `onMount`-triggered save has started, and
**after** it has fully finished. There's a window between page load and the
first `saving = true` (while `onMount`'s own `await`s are still in flight)
where the fieldset already reads "not disabled" even though the save/reassign
cycle hasn't happened yet. A user (or a test) that starts typing as soon as
inputs look enabled can end up typing during exactly that cycle.

## Where this is currently worked around, not fixed

`cypress/e2e/instructor.cy.ts` (Test Case 8, "Instructor Application
Submission") pads a fixed 2-second wait after visiting `/apply` and before
checking that the phone number input is enabled, with a comment pointing back
to this file. That wait was restored deliberately after being removed and
causing the scrambled-input failure described above — it isn't just leftover
caution, it's currently the only thing standing between this bug and a flaky
(or corrupted) real test run.

## Suggested fix direction (not implemented)

A few options, roughly in order of how surgical they are:

1. **Expose a real "settled" signal.** Add a `hasLoaded`/`hasSavedOnce`
   `$state` flag that only flips `true` after the `onMount` chain's _first_
   `handleSave()` call (or the "no save needed" branch) has fully resolved,
   and gate the fieldset's `disabled` on that too. This directly closes the
   "before vs. after" ambiguity in the `saving` flag.
2. **Avoid replacing the whole object.** Instead of
   `values = cloneDeep(applicationData)` wholesale, merge only the fields
   that differ from what's already in `values`/`$form`, so unrelated inputs
   the user hasn't touched don't get new object identities.
3. **Await the initial save before rendering inputs interactively**, e.g.
   show a loading state until the `onMount` promise chain settles, rather
   than relying on a derived `disabled` prop that can't distinguish
   "not yet started" from "already done."

Any of these would let the Cypress wait in `instructor.cy.ts` be replaced
with a real condition (e.g. waiting on the new settled flag) instead of a
fixed delay.
