# gbSTEM Portal

<https://www.gbstem.org/>

## Description

> Inspiring the Next Generation of STEM Innovators

Greater Boston STEM Program's website for instructors and students to apply and view classes. It serves as the primary gateway for users of the program to register for classes, view schedules, upload/parse documents, and manage their enrollment.

This website is part of the gbSTEM ecosystem. **It is primarily maintained by a rotating group of High School and college students.** Because of this, maintaining clear, readable code and robust documentation is highly prioritized.

## Frameworks and Libraries

This project relies on several key modern web technologies:

- **[SvelteKit](https://kit.svelte.dev/)**: The core Svelte framework used for building the site. We use SvelteKit's filesystem-based routing, server hooks, and server-side loading logic.
- **[Svelte](https://svelte.dev/)**: The reactive component framework (using Svelte 5 runes) for building lightweight, highly responsive user interfaces.
- **[TypeScript](https://www.typescriptlang.org/)**: A strongly typed programming language that builds on JavaScript, giving you better tooling and strict type-checking at any scale.
- **[Tailwind CSS](https://tailwindcss.com/)**: A utility-first CSS framework packed with classes that can be composed to build any design, directly in your markup.
- **[Firebase](https://firebase.google.com/)**: Client-side SDK used for interacting with the database (Cloud Firestore) and Firebase Authentication.
- **[Firebase Admin SDK](https://firebase.google.com/docs/admin)**: Node.js SDK used for server-side management tasks, backend hooks, and admin-level database operations.
- **[dotenv](https://github.com/motdotla/dotenv)**: Module that loads environment variables from a `.env` file into `process.env`.
- **[SendGrid](https://sendgrid.com/)**: Transactional email service used to send system notifications, confirmations, and reminders.
- **[Jest](https://jestjs.io/) & [Svelte Testing Tools](https://testing-library.com/)**: Our primary testing suite. We use Jest to write unit tests for utility functions, helper files, and mock Firestore queries.
- **[SvelteKit Superforms](https://superforms.rocks/)**: Form state management library for SvelteKit, used to handle form loading states, bindings, validation, and progressive enhancement.
- **[Zod](https://zod.dev/)**: A schema declaration and validation library, used to declare form schemas and validate client/server payloads.
- **[Formsnap](https://formsnap.dev/)**: Accessible, accessible-first form builder library for Svelte, integrating SvelteKit-Superforms validation with shadcn/bits-ui components.
- **[Bits UI](https://bits-ui.com/)**: A headless component library for Svelte providing accessible, unstyled components that serve as the foundation for Formsnap and shadcn components.
- **[MJML](https://github.com/mjmlio/mjml)**: Email templating language and engine used to generate responsive HTML emails.

## Getting Started with Development

### 1. Environment Configuration

Before running the development server, you must configure your local environment variables:

1. Copy the `.env.example` file to create a `.env.local` file:

   ```bash
   cp .env.example .env.local
   ```

2. For general development, step 1 gives you everything you need. For special cases where you need access to production resources, you may edit `.env.local` to adjust the placeholder values with the actual service credentials.

> [!WARNING]
> **Never commit your `.env.local` file or actual secrets to GitHub.** This file is configured to be ignored by Git to prevent exposing sensitive API keys and credentials. For details on how `.env` files work and how to avoid exposing credentials, read the [dotenv environment secrets guide](https://github.com/motdotla/dotenv#should-i-commit-my-env-file) and [GitHub's guide on ignoring files](https://docs.github.com/en/get-started/getting-started-with-git/ignoring-files).

### 2. Firebase Emulator Suite (Local Development)

For local development and testing, you can use the **Firebase Emulator Suite** to run local instances of Firebase products (Firestore, Authentication, and Storage). This allows you to test application features offline without affecting production or development cloud resources.

Since the Firebase services are shared across both the `admin` and `portal` projects, you only need to start the emulator once. Follow the official [Firebase Emulator Suite: Connect and Prototype](https://firebase.google.com/docs/emulator-suite/connect_and_prototype?database=Firestore) guide to set up and run the emulators on your local machine.

Then, in the [admin project](https://github.com/gbstem/admin), run `yarn seed` to seed the database with a demo admin user and a demo signup token as described in the `admin` project's [README.md](https://github.com/gbstem/admin/blob/main/README.md).

> [!WARNING]
> By default, the Firestore emulator runs in-memory. This means all seeded data and modifications are lost whenever you restart the emulator. If you want to persist the database state across restarts, start the emulator with the `--import` and `--export-on-exit` flags:
>
> ```bash
> firebase emulators:start --log-verbosity=quiet --import=./emulator-data --export-on-exit
> ```
>
> Otherwise, you must re-run the seed script every time you restart the emulator.

### 3. Run the Development Server

```bash
# install dependencies
yarn install

# run the development server
yarn dev

# start the development server and open in browser
yarn start

# preview the production build locally
yarn preview

# automatically format code
yarn format

# check for type errors
yarn run check

# check for type errors and watch for changes
yarn run check:watch

# check for style and lint issues
yarn lint

# run unit tests
yarn test

# run E2E integration tests (Cypress)
npx cypress run
```

### 4. Running End-to-End Tests (Cypress)

To run the E2E Cypress integration tests:

1. Ensure the Firebase emulators are running from the parallel `admin` repository via `yarn emulators`.
2. Start the local portal development server (`yarn dev`).
3. Run the Cypress suite using:

   ```bash
   npx cypress run
   ```

> [!NOTE]
> **Parallel Checkout Requirement**: The Cypress test runner automatically runs the database seed script prior to test execution. This requires the `admin` repository to be checked out in a parallel directory (`../admin`) relative to the `portal` directory so the test runner can invoke `cd ../admin && yarn seed`.

Open [http://localhost:5173](http://localhost:5173) with your browser to see the result for `yarn dev` or `yarn start`. You can start editing any page or component, and when running in development mode, your changes will be reflected in the browser automatically.

## Code Organization: Helpers, Services, and Where New Code Should Go

If you're new to this codebase, one question comes up constantly: **"I need to write some code — where does it go?"** This section answers that.

Historically, a lot of this app's logic lived directly inside `.svelte` files: a component's `<script>` block would fetch data from Firestore, figure out what that data meant (e.g. "is this student eligible for this class?"), and render it, all tangled together. That's fast to write, but it makes files huge (many were 500–1,000 lines), hard to read, and nearly impossible to unit test — you can't write a quick, automated Jest test for logic that's buried inside a Svelte component and calls the live database directly.

To fix this, every new (or newly-touched) piece of logic gets split into one of two places, based on a simple question: **does it touch the network, or not?**

### 1. Pure logic (no network calls) → `src/lib/helpers/*.ts`

A **pure function** only looks at the inputs you give it and returns an output — no database calls, no reading page/global state, no side effects. Give it the same inputs today or a year from now, and it returns the same result. Examples already in this codebase: sorting available classes by spots remaining, deciding whether a student's grade qualifies them for a class, or building the JSON payload we send to an email API.

**Why this matters:** pure functions are the cheapest, easiest thing in the entire codebase to unit test — no mocking, no setup, just "call it with some inputs, check what comes back." If you're writing an `if`/`else` chain, a date calculation, a status computation, or anything that transforms data without touching Firestore or an API, it almost certainly belongs in a `.ts` file under `src/lib/helpers/`, with a matching test file in `__tests__/` (see `classesPageHelpers.test.ts`, `subClassesHelpers.test.ts`, etc. for examples of the pattern), not buried in a `.svelte` file's `<script>` block.

### 2. Firestore reads/writes → the Data Access Layer (`src/lib/services/*.ts`)

A **Data Access Layer (DAL)** is just a name for "the one place in the app allowed to talk directly to the database." Instead of every `.svelte` file calling Firestore functions like `getDoc`, `setDoc`, or `updateDoc` directly, those calls live in `src/lib/services/<name>Service.ts` files (`classService.ts`, `applicationService.ts`, `registrationService.ts`, `substituteService.ts`, `interviewService.ts`, `announcementService.ts`, `userService.ts`), each exporting an object of `async` functions named for _what_ they do (`enrollStudentInClass`, `fetchDecisionType`) rather than _how_ they do it.

A `.svelte` component then just calls something like:

```ts
await classService.enrollStudentInClass(classId, studentUid)
```

instead of constructing a raw `updateDoc(doc(db, classesCollection, classId), { students: arrayUnion(studentUid) })` call inline, mixed in with template markup and UI state.

**Why this matters, especially for a small, rotating volunteer team:**

- **Testability without a real database.** Our Jest tests shouldn't need an internet connection or a live Firestore/emulator instance to run — that would make the whole test suite slow, flaky, and dependent on specific data existing. By funneling every Firestore call through a service function, a test can "mock" (fake) the `firebase/firestore` module — see any `__tests__/*Service.test.ts` file — and check that our code calls the database correctly, _including what happens when a write fails_ (permission denied, network error, missing document), all in milliseconds, with nothing real running.
- **One place to fix things.** If we ever rename a Firestore field or restructure a collection, we only need to update the service function(s) that touch it — not hunt through every `.svelte` file that happened to read or write that field.
- **No copy-pasted queries.** Multiple pages often need the same data (e.g. "this parent's list of registered children"). Without a DAL, that Firestore query gets copy-pasted into several components; when a bug is found and fixed in one copy, the others are silently left behind with the old, buggy version. With a DAL, every caller shares the same `registrationService.fetchChildRegistrationSlots(...)` function, so a fix in one place fixes it everywhere.
- **Shorter, more readable components.** A `.svelte` file's `<script>` block should mostly be about _what the page does_ and _how it's laid out_ — not the mechanics of database queries.

### A rule of thumb when writing new code

Before adding code to a `.svelte` file, ask:

- **Does it call Firestore (`getDoc`, `setDoc`, `updateDoc`, `deleteDoc`, `addDoc`, `getDocs`, a `query(...)`, etc.)?** → It belongs in a `src/lib/services/*.ts` file, with a Jest test in `__tests__/` that mocks `firebase/firestore` (copy the top of an existing `*Service.test.ts` file to get the mocking pattern right).
- **Is it a calculation or transformation with no side effects?** → It belongs in a `src/lib/helpers/*.ts` file, with a matching Jest test.
- **Is it about what's rendered on screen, or wiring the two above together?** → That's the one thing that _does_ belong in the `.svelte` file itself.

Whenever you add or change a service or helper function, add or update its test in the same commit — a change without a test is much more likely to silently break something down the road once the next volunteer touches that file, since there's no automated check that would catch it.

## Firestore Schema

See the **[Firebase Firestore Database schema in the Admin Repository's README.md](https://github.com/gbstem/admin/blob/main/README.md#firestore-database-schema)**.

## Adding a New Semester

To transition the gbSTEM system to a new semester, configuration and course catalog updates must be applied.

For detailed, step-by-step instructions on updating the semester suffix and copying the updated course catalog configurations, please refer to the **[Adding a New Semester section in the Admin Repository's README.md](https://github.com/gbstem/admin/blob/main/README.md#adding-a-new-semester)**.

## Updating Dependencies

It is important to periodically update the project's dependencies to address security vulnerabilities, receive bug fixes, improve performance, and keep up with the latest features. Since this project is maintained by a rotating group of students, regular updates prevent the codebase from falling behind or becoming incompatible with modern deployment platforms.

While GitHub Dependabot handles minor and patch dependency updates automatically, we still need to manually run `ncu` to catch major updates that Dependabot misses. Check `npx depcheck` occasionally to catch any missing dependencies. While doing this, also check for the latest yarn berry v4 package manager release and update `packageManager` at the bottom of `package.json` to use that instead.

For those manual updates, we use the [npm-check-updates (ncu)](https://github.com/raineorshine/npm-check-updates) tool to check for and apply updates. Refer to the [installation instructions](https://github.com/raineorshine/npm-check-updates#installation) to install it.

Once `ncu` is installed, follow this sequence of commands to update dependencies:

> [!IMPORTANT]
> **Pin Zod to version 3 (`^3.x.x`)**: We currently restrict Zod to v3 because SvelteKit Superforms and Formsnap adapters have known type resolution and shape-generation compatibility issues with Zod v4 (refer to the public discussion at [ciscoheat/sveltekit-superforms #630](https://github.com/ciscoheat/sveltekit-superforms/issues/630)).
>
> **Pin TypeScript to version 6 (`^6.x.x`), `@types/node` to version 24 (`^24.x.x`) due to us configuring Vercel to use Node.js 24.x, and firebase/firebase-admin to their current versions**.
>
> When executing `ncu -u`, ensure the avoided major upgrades aren't applied.

```bash
# Update pinned dependencies to their latest minor/patch versions
ncu -t minor -u firebase firebase-admin typescript "@types/node" zod

# Update all other dependencies in package.json to the latest versions
ncu --peer --reject firebase,firebase-admin,typescript,"@types/node",zod -u

# Install the updated packages and update yarn.lock
yarn install

# Run unit tests to verify no breaking changes were introduced
yarn test

# Run type checks
yarn run check

# Run lint checks to ensure code style consistency
yarn lint

# Go to http://localhost:5173 and do manual visual checks and tests

# Build the project for production to verify compatibility and compile-time checks
yarn build
```

After verifying that the tests, linting, and build pass successfully, commit and submit both `package.json` and `yarn.lock` to the repository.

## Directory and File Index

Below is an alphabetical list of the top-level directories and significant configuration files to help you navigate the codebase:

### Directories

- **`.github/`**: Contains GitHub configuration for GitHub, including our Dependabot configuration for automating minor and patch package updates, and our Continuous Integration (CI) test workflows.
- **`.husky/`**: Configuration for Husky, managing Git hooks like pre-commit formatting and linting.
- **`.svelte-kit/`**: Automatically generated directory containing SvelteKit configuration, generated routes, and typings.
- **`__tests__/`**: Contains all of our Jest unit tests (such as utility tests and form validation schema scenario tests).
- **`cypress/`**: Contains the Cypress e2e test suite, test configurations, fixtures, and page object/support configurations.
- **`node_modules/`**: Contains the project's dependencies.
- **`src/`**: The core SvelteKit application source code.
  - **`src/lib/`**: Reusable libraries, utility modules, and components:
    - **`src/lib/client/`**: Client-side specific integrations, such as clients for Firestore.
  - **`src/lib/components/`**: Reusable Svelte UI components (e.g. tables, buttons, and form components like `FormInput.svelte`).
    - **`src/lib/components/forms/`**: Sub-components containing form structures and validation logic (`schemas.ts`).
    - **`src/lib/data/`**: Centralized static data constants, models, mock data, and TS types.
    - **`src/lib/helpers/`**: Pure, side-effect-free TypeScript functions (calculations, data transformations, payload builders) extracted out of `.svelte` files so they're easy to unit test — see [Code Organization](#code-organization-helpers-services-and-where-new-code-should-go) above.
    - **`src/lib/server/`**: Server-side specific integrations, such as initializing Firebase Admin.
    - **`src/lib/services/`**: The Data Access Layer — every Firestore read/write goes through a function here instead of being called directly from a `.svelte` file — see [Code Organization](#code-organization-helpers-services-and-where-new-code-should-go) above.
  - **`src/routes/`**: Handles application URL routing based on the filesystem. Subdirectories represent URL paths.
- **`static/`**: Static assets such as images and icons that can be accessed publicly by the browser.

### Files

- **`.env.example`**: Template file defining required local environment variables.
- **`.gitignore`**: Specifies which files and directories Git should ignore (like `node_modules/` and `.svelte-kit/`).
- **`.prettierignore`**: Specifies which files and directories Prettier should ignore when formatting.
- **`cypress.config.ts`**: The configuration file for the Cypress e2e testing interface and environmental triggers.
- **`eslint.config.js`**: ESLint configuration mapping coding rules and checks (replacing the legacy `.eslintrc.cjs`).
- **`jest.config.ts`**: The configuration file for our Jest testing environment, specifically tailored to work alongside TypeScript and Svelte.
- **`jest.setup.ts`**: Initial setup code that runs before our Jest tests, importing tools like `@testing-library/jest-dom` for custom DOM matchers.
- **`package.json`**: Defines the project's details, scripts, and dependencies (the npm packages we rely on).
- **`postcss.config.js`**: Configuration for PostCSS, typically used for transforming CSS with plugins.
- **`prettier.config.js`**: Configuration rules for Prettier, ensuring consistent code formatting across the project.
- **`src/data.csv`**: A static CSV data file containing program information or dataset resources.
- **`svelte.config.js`**: SvelteKit-specific configuration (like adapter configurations and compiler options).
- **`TEST_PLAN.md`**: A comprehensive test plan outlining testing strategies, test scenarios, coverage, and instructions for running Jest and Cypress tests.
- **`tsconfig.json`**: Configuration settings for the TypeScript compiler.
- **`vite.config.js`**: Vite configuration file for compiling, bundling, and configuring build plugins.
- **`yarn.lock`**: An automatically generated file that locks down the exact versions of dependencies used, ensuring that all developers have identical, reproducible environments.
