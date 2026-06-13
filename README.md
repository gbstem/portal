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
- **[qrious](https://github.com/neocotic/qrious)**: A pure JavaScript library to generate QR codes using HTML5 Canvas.
- **[SendGrid](https://sendgrid.com/)**: Transactional email service used to send system notifications, confirmations, and reminders.
- **[Jest](https://jestjs.io/) & [Svelte Testing Tools](https://testing-library.com/)**: Our primary testing suite. We use Jest to write unit tests for utility functions, helper files, and mock Firestore queries.
- **[SvelteKit Superforms](https://superforms.rocks/)**: Form state management library for SvelteKit, used to handle form loading states, bindings, validation, and progressive enhancement.
- **[Zod](https://zod.dev/)**: A schema declaration and validation library, used to declare form schemas and validate client/server payloads.
- **[Formsnap](https://formsnap.dev/)**: Accessible, accessible-first form builder library for Svelte, integrating SvelteKit-Superforms validation with shadcn/bits-ui components.
- **[Bits UI](https://bits-ui.com/)**: A headless component library for Svelte providing accessible, unstyled components that serve as the foundation for Formsnap and shadcn components.

## Getting Started with Development

### 1. Environment Configuration

Before running the development server, you must configure your local environment variables:

1. Copy the `.env.example` file to create a `.env.local` file:

   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and adjust the placeholder values with your actual service credentials, preferably development credentials if available.

> [!WARNING]
> **Never commit your `.env.local` file or actual secrets to GitHub.** This file is configured to be ignored by Git to prevent exposing sensitive API keys and credentials. For details on how `.env` files work and how to avoid exposing credentials, read the [dotenv environment secrets guide](https://github.com/motdotla/dotenv#should-i-commit-my-env-file) and [GitHub's guide on ignoring files](https://docs.github.com/en/get-started/getting-started-with-git/ignoring-files).

### 2. Firebase Emulator Suite (Local Development)

For local development and testing, you can use the **Firebase Emulator Suite** to run local instances of Firebase products (Firestore, Authentication, and Storage). This allows you to test application features offline without affecting production or development cloud resources.

Since the Firebase services are shared across both the `admin` and `portal` projects, you only need to start the emulator once. Follow the official [Firebase Emulator Suite: Connect and Prototype](https://firebase.google.com/docs/emulator-suite/connect_and_prototype?database=Firestore) guide to set up and run the emulators on your local machine.

Then, in the [admin project](https://github.com/gbstem/admin), run `npm run seed` to seed the database with a demo admin user and a demo signup token as described in the `admin` project's [README.md](https://github.com/gbstem/admin/blob/main/README.md).

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
npm install

# run the development server
npm run dev

# start the development server and open in browser
npm start

# preview the production build locally
npm run preview

# automatically format code
npm run format

# check for type errors
npm run check

# check for type errors and watch for changes
npm run check:watch

# check for style and lint issues
npm run lint

# run unit tests
npm test

# run E2E integration tests (Cypress)
npx cypress run
```

### 4. Running End-to-End Tests (Cypress)

To run the E2E Cypress integration tests:

1. Ensure the Firebase emulators are running from the parallel `admin` repository via `npm run emulators`.
2. Start the local portal development server (`npm run dev`).
3. Run the Cypress suite using:

   ```bash
   npx cypress run
   ```

> [!NOTE]
> **Parallel Checkout Requirement**: The Cypress test runner automatically runs the database seed script prior to test execution. This requires the `admin` repository to be checked out in a parallel directory (`../admin`) relative to the `portal` directory so the test runner can invoke `npm run --prefix ../admin seed`.

Open [http://localhost:5173](http://localhost:5173) with your browser to see the result for `npm run dev` or `npm start`. You can start editing any page or component, and when running in development mode, your changes will be reflected in the browser automatically.

## Updating Dependencies

It is important to periodically update the project's dependencies to address security vulnerabilities, receive bug fixes, improve performance, and keep up with the latest features. Since this project is maintained by a rotating group of students, regular updates prevent the codebase from falling behind or becoming incompatible with modern deployment platforms.

We use the [npm-check-updates (ncu)](https://github.com/raineorshine/npm-check-updates) tool to check for and apply updates. Refer to the [installation instructions](https://github.com/raineorshine/npm-check-updates#installation) to install it.

Once `ncu` is installed, follow this sequence of commands to update dependencies:

> [!IMPORTANT]
> **Pin Zod to version 3 (`^3.x.x`)**: We currently restrict Zod to v3 because SvelteKit Superforms and Formsnap adapters have known type resolution and shape-generation compatibility issues with Zod v4 (refer to the public discussion at [ciscoheat/sveltekit-superforms #630](https://github.com/ciscoheat/sveltekit-superforms/issues/630)). When executing `ncu -u`, ensure Zod is not upgraded to v4 which the commands below avoid, or manually revert its version in `package.json` before installing.

```bash
# Update the dependencies in package.json to the latest versions (minor/patch)
ncu -t minor -u zod
ncu --peer --reject zod -u

# Install the updated packages and update package-lock.json
npm install

# Run unit tests to verify no breaking changes were introduced
npm test

# Run type checks
npm run check

# Run lint checks to ensure code style consistency
npm run lint

# Go to http://localhost:5173 and do manual visual checks and tests

# Build the project for production to verify compatibility and compile-time checks
npm run build
```

After verifying that the tests, linting, and build pass successfully, commit and submit both `package.json` and `package-lock.json` to the repository.

## Directory and File Index

Below is an alphabetical list of the top-level directories and significant configuration files to help you navigate the codebase:

### Directories

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
    - **`src/lib/server/`**: Server-side specific integrations, such as initializing Firebase Admin.
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
- **`package-lock.json`**: An automatically generated file that locks down the exact versions of dependencies used, ensuring that all developers have identical, reproducible environments.
- **`postcss.config.js`**: Configuration for PostCSS, typically used for transforming CSS with plugins.
- **`prettier.config.js`**: Configuration rules for Prettier, ensuring consistent code formatting across the project.
- **`src/data.csv`**: A static CSV data file containing program information or dataset resources.
- **`svelte.config.js`**: SvelteKit-specific configuration (like adapter configurations and compiler options).
- **`TEST_PLAN.md`**: A comprehensive test plan outlining testing strategies, test scenarios, coverage, and instructions for running Jest and Cypress tests.
- **`tsconfig.json`**: Configuration settings for the TypeScript compiler.
- **`vite.config.js`**: Vite configuration file for compiling, bundling, and configuring build plugins.
