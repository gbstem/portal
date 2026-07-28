// Jest transformer for plain-ESM `.js` files under node_modules/svelte.
// Jest ignores node_modules for transformation by default, but the
// compiled output of jest-transform-svelte-module.cjs imports Svelte's
// runtime directly from `svelte/internal/client`, which ships as raw ESM
// (`export { ... } from '...'`) - Jest's CJS module loader can't parse
// that without this down-leveling step. Pairs with the
// `transformIgnorePatterns` override in jest.config.ts that lets this
// transform actually reach files under node_modules/svelte.
const ts = require('typescript')

module.exports = {
  process(sourceText, sourcePath) {
    const code = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    }).outputText

    return { code }
  },
}
