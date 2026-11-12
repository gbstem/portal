# Changes that span portal and admin

Portal and admin share the **same Firestore database and Firebase project** and the same shape of `src/lib/data/collections.ts`. Unlike admin (which can browse past semesters), **portal only ever reads and writes the current semester** — `withSemester()` here always stamps `currentSemester` with no override, since there's no `?semester=` browsing UI. The `currentSemester` suffix, `semesterDates.json` and `courses.json` in this repo are copied by hand from admin's copy during a semester rollover (see admin's README "Adding a New Semester") — **update both repos together**, and update Firestore security rules identically in both since they're merged by hand for production.

Cypress e2e tests here expect a sibling `../admin` checkout (used to seed the shared emulator) — see README's Cypress section.

## `courses.json` and curriculum links

`courses.json` is the course catalog, and the curriculum repo holds a third verbatim copy. It carries each course's `id` on curriculum.gbstem.org, which is what `#lib/helpers/curriculumLink` turns into `/{track}/{id}` for the **Curriculum** button. Two things about it are load-bearing:

- The trailing `A`/`B` on an id is the half of the year, so the same stored course name resolves to a different page in fall than in spring (`data/index.ts` slices the catalog by `currentSemester`, never by the wall clock).
- The course segment is case-sensitive on the curriculum site, where `/cs/webdevA` resolves and `/cs/webdeva` throws.

Never hand-edit this copy — a hand-edited `springCourses.json` once silently became a duplicate of its own fall file, leaving portal with no spring courses at all.

## Two PRs on a branch of the same name

CI relies on that: portal's e2e job seeds the emulator from an admin branch with the same name when one exists, and from admin's default branch otherwise (see `.github/workflows/ci.yml`). Without it, a portal PR whose tests need a new seed fixture could not go green until the admin PR merged — so CI stopped gating exactly the coordinated changes that most need gating, and the way out was to merge admin unreviewed. The job logs which admin revision it seeded from, so check that line first when an e2e failure looks like missing data.

## `src/lib/shared/` is identical in both repos

It holds small utilities both sites need, each with a test of the same name in `__tests__/`:

- `timestamps.ts`: `toDate`/`toDateOrNull` for a stored date in any shape.
- `apiErrors.ts`: `errorMessage(res, fallback)` for a refused `fetch` to one of our routes.
- `gbstemTime.ts`: a `semesterDates.json` date as an instant in New York time, and `localTimeZoneLabel()` for labelling times shown in the viewer's zone.
- `interviews.ts`: `INTERVIEW_DURATION_MINUTES` and the interview window.

Files there import nothing from `#lib`, so they can be copied across verbatim: change one in both repos together, on branches of the same name. Before writing a helper that isn't specific to this site (another `typeof value.toDate === 'function'`, another `res.json().catch(...)`), look there first, and put a new one there rather than in the file that happens to need it.
