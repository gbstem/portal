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
- **[PDF Rendering & Parsing Tools](https://mozilla.github.io/pdf.js/)**: Uses `pdfjs-dist`, `pdf-parse`, `react-pdf`, and `svelte-pdf` libraries to parse, extract, render, and display PDF certificates and documents directly within the portal interface.
- **[dotenv](https://github.com/motdotla/dotenv)**: Module that loads environment variables from a `.env` file into `process.env`.
- **[file-saver](https://github.com/eligrey/FileSaver.js/)**: An implementation of the HTML5 `saveAs()` FileSaver interface, used to save certificates and files on client machines.
- **[qrious](https://github.com/neocotic/qrious)**: A pure JavaScript library to generate QR codes using HTML5 Canvas.
- **[Postmark](https://postmarkapp.com/) / [SendGrid](https://sendgrid.com/)**: Transactional email services used to send system notifications, confirmations, and reminders.
- **[Jest](https://jestjs.io/) & [Svelte Testing Tools](https://testing-library.com/)**: Our primary testing suite. We use Jest to write unit tests for utility functions, helper files, and mock Firestore queries.

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

1. Follow the official [Firebase Emulator Suite: Connect and Prototype](https://firebase.google.com/docs/emulator-suite/connect_and_prototype?database=Firestore) guide to set up and run the emulators on your local machine.
2. Update your `.env.local` file to point to the local emulators by uncommenting the relevant lines at the bottom of the file (see snippet below). The Firebase Admin SDK automatically routes operations to the emulators when the following environment variables are set:

   ```env
   FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
   FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
   STORAGE_EMULATOR_HOST="127.0.0.1:9199"
   ```

   Make sure the host and port values match your emulator configurations in `firebase.json`.

3. For new emulator instances, run `npm run seed` in the [admin project](https://github.com/gbstem/admin) to seed the database with a demo admin user and a demo signup token as described in the `admin` project's [README.md](https://github.com/gbstem/admin/blob/main/README.md).

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

# build for production
npm run build

# build and deploy to Firebase
npm run deploy
```

Open [http://localhost:5173](http://localhost:5173) with your browser to see the result for `npm run dev` or `npm start`. You can start editing any page or component, and when running in development mode, your changes will be reflected in the browser automatically.

## Updating Dependencies

It is important to periodically update the project's dependencies to address security vulnerabilities, receive bug fixes, improve performance, and keep up with the latest features. Since this project is maintained by a rotating group of students, regular updates prevent the codebase from falling behind or becoming incompatible with modern deployment platforms.

We use the [npm-check-updates (ncu)](https://github.com/raineorshine/npm-check-updates) tool to check for and apply updates. Refer to the [installation instructions](https://github.com/raineorshine/npm-check-updates#installation) to install it.

Once `ncu` is installed, follow this sequence of commands to update dependencies:

```bash
# Update the dependencies in package.json to the latest versions (minor/patch)
ncu -u

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
- **`__tests__/`**: Contains all of our Jest unit tests. Tests are organized by component/utility domain (e.g., `utils.test.ts`).
- **`node_modules/`**: Contains the project's dependencies.
- **`src/`**: The core SvelteKit application source code.
  - **`src/lib/`**: Reusable libraries, utility modules, and components:
    - **`src/lib/client/`**: Client-side specific integrations, such as clients for Firestore.
    - **`src/lib/components/`**: Reusable Svelte UI components (e.g. forms, tables, buttons).
    - **`src/lib/data/`**: Centralized static data constants, models, mock data, and TS types.
    - **`src/lib/server/`**: Server-side specific integrations, such as initializing Firebase Admin.
  - **`src/routes/`**: Handles application URL routing based on the filesystem. Subdirectories represent URL paths.
- **`static/`**: Static assets such as images and icons that can be accessed publicly by the browser.

### Files

- **`.eslintignore`**: Specifies which files and directories ESLint should ignore.
- **`.eslintrc.cjs`**: Configuration rules for ESLint, ensuring consistent code style and checking for common errors.
- **`.gitignore`**: Specifies which files and directories Git should ignore (like `node_modules/` and `.svelte-kit/`).
- **`.prettierignore`**: Specifies which files and directories Prettier should ignore when formatting.
- **`certificates.pdf`**: Sample/template PDF certificate used within the application.
- **`jest.config.ts`**: The configuration file for our Jest testing environment, specifically tailored to work alongside TypeScript and Svelte.
- **`jest.setup.ts`**: Initial setup code that runs before our Jest tests, importing tools like `@testing-library/jest-dom` for custom DOM matchers.
- **`package.json`**: Defines the project's details, scripts, and dependencies (the npm packages we rely on).
- **`package-lock.json`**: An automatically generated file that locks down the exact versions of dependencies used, ensuring that all developers have identical, reproducible environments.
- **`postcss.config.js`**: Configuration for PostCSS, typically used for transforming CSS with plugins.
- **`prettier.config.js`**: Configuration rules for Prettier, ensuring consistent code formatting across the project.
- **`src/data.csv`**: A static CSV data file containing program information or dataset resources.
- **`svelte.config.js`**: SvelteKit-specific configuration (like adapter configurations and compiler options).
- **`tailwind.config.js`**: Tailwind CSS configuration, determining design tokens like themes and spacing.
- **`tsconfig.json`**: Configuration settings for the TypeScript compiler.
- **`vite.config.js`**: Vite configuration file for compiling, bundling, and configuring build plugins.

---

## Major Dependency Upgrades (TODO)

Below is a list of major dependency updates that were skipped during the dependency cleanup because they require manual migrations, configuration updates, or code changes.

| Package          | Current Version | Available Version | Migration Impact & Upgrade Guide                                                                                                                                                                                                                                             |
| :--------------- | :-------------- | :---------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firebase-admin` | `^11.11.1`      | `^13.10.0`        | **FCM Deprecations:** Deprecates `sendAll` in favor of `sendEach`. Upgrades internal dependencies (like `jose`) which can break Jest mocking. Refactor messaging calls and check tests.                                                                                      |
| `firebase`       | `^10.14.1`      | `^12.14.0`        | **SDK Version Upgrade:** Verify all clientside SDK method calls and typescript signatures.                                                                                                                                                                                   |
| `pdf-parse`      | `^1.1.4`        | `^2.4.5`          | **API Redesign:** v2 is class-based (`PDFParse`) and is not backward compatible with the functional v1 API. Internal exports are restricted. Refactor codebase to use `new PDFParse(...)` and its asynchronous methods.                                                      |
| `pdfjs-dist`     | `^3.11.174`     | `^5.7.284`        | **WASM OpenJPEG & CSS layers:** Requires setting `wasmUrl` API option. Custom layers depend on new CSS variables. Ensure worker script versions are identical to the library version.                                                                                        |
| `react-pdf`      | `^7.7.3`        | `^10.4.1`         | **ESM-Only Format:** Shipped as ESM-only, which throws exports errors in CommonJS Jest tests. Import paths changed (use `/dist` instead of `/dist/esm`). PDF.js worker extension changed from `.js` to `.mjs`. Recommend migrating tests from Jest to Vitest.                |
| `svelte-pdf`     | `^1.0.28`       | `^2.0.2`          | **pdfjs-dist Wrapper:** Upgrade together with `pdfjs-dist` v5. Check SSR context compatibility.                                                                                                                                                                              |
| `tailwind-merge` | `^1.14.0`       | `^3.6.0`          | **Tailwind CSS v4 Compatibility:** v3 drops support for Tailwind CSS v3. Do not upgrade until Tailwind CSS v4 is adopted.                                                                                                                                                    |
| `tailwindcss`    | `^3.4.19`       | `^4.3.0`          | **CSS-First Configuration:** Tailwind CSS v4 is a ground-up rewrite that replaces `tailwind.config.js` with `@theme` design tokens in CSS. Drops PostCSS by default and automatically detects source files. Run `npx @tailwindcss/upgrade@latest` to automate the migration. |
