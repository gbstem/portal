# Agent Instructions for gbSTEM Admin

1. This is a SvelteKit project. See [README.md](README.md) for background on the site, its architecture, and development processes.
2. Use `npm` as the package manager.
3. Create or update the Jest unit test to have good coverage and to pass for the modified code.
4. If you're updating code in non-minor ways, also run the Cypress e2e test suite via `npm run cypress` and `npm run build`. It takes a few minutes so do it sparingly.
5. For Cypress e2e tests or other HTTP based testing, try to use my already running dev server on <http://localhost:5173> for testing, but start your own if that isn't running or use `npm run cypress:run` which starts the server, runs the tests, and then stops the server. But if it fails because the Firestore Emulator isn't running (the Cypress tests check for that early on), ask the user to start the emulator and seed the database as instructed in [README.md](README.md).
6. We use Prettier for code formatting, which you can run via `npm run format`.
7. Before you say you're done, run `npm run lint && npm run test` to unit test the entire project via Jest, and ensure the lint run is clean. If your changes are very minor, such as Jest test-only or CSS-only changes, you may skip running the Cypress tests.
