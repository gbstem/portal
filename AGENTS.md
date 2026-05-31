# Agent Instructions for gbSTEM Portal

1. This is a SvelteKit project. See [README.md](README.md) for background on the site, its architecture, and development processes.
2. Use `npm` as the package manager.
3. Create or update the Jest unit test to have good coverage and to pass for the modified code.
4. If you're updating code in non-minor ways, also run `npm run build`.
5. For HTTP based testing, try to use my already running dev server on <http://localhost:5173> for testing, but start your own if that isn't running.
6. We use Prettier for code formatting, which you can run via `npm run format`.
7. Before you say you're done, run `npm run check && npm run lint && npm run test` to unit test the entire project via Jest, and ensure the lint run is clean.
