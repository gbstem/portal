// Jest transformer for `.svelte.ts` rune modules (shared state in
// src/lib/stores.svelte.ts). ts-jest alone can't run these: `$state` etc.
// are Svelte compiler macros, not runtime functions, so plain TS
// transpilation leaves them as undefined-function calls. Vite handles this
// for the real app via vite-plugin-svelte, which strips TS then runs the
// result through Svelte's `compileModule`; this transformer does the same
// two steps for Jest, then down-levels the compiled ESM output to
// CommonJS so Jest's CJS-based module runtime can execute it.
//
// IMPORTANT for anyone writing a `.svelte.ts`/`.svelte.test.ts` file: this
// transformer is plain `ts.transpileModule` with no jest-hoist step, unlike
// the ts-jest preset used for every other test file in this repo (ts-jest
// bundles its own AST transform that hoists `jest.mock()` calls above
// imports; this one doesn't). That means `jest.mock()` calls here are NOT
// hoisted - they run in literal source order. Any `jest.mock()` that needs
// to intercept a module before a component/service under test imports it
// MUST be written physically before the `import` statements in the file
// (this is syntactically legal - ES modules don't require imports to be
// first), or it registers too late and silently mocks nothing.
const ts = require('typescript')
const { compile, compileModule } = require('svelte/compiler')

module.exports = {
  process(sourceText, sourcePath) {
    if (sourcePath.endsWith('.svelte')) {
      const compiled = compile(sourceText, {
        filename: sourcePath,
        generate: 'client',
      })
      const code = ts.transpileModule(compiled.js.code, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
        fileName: sourcePath,
      }).outputText
      return { code }
    }

    const stripped = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    }).outputText

    const compiled = compileModule(stripped, {
      filename: sourcePath,
      generate: 'client',
    })

    const code = ts.transpileModule(compiled.js.code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    }).outputText

    return { code }
  },
}
