// Jest transformer for `.svelte.ts` rune modules (shared state in
// src/lib/stores.svelte.ts). ts-jest alone can't run these: `$state` etc.
// are Svelte compiler macros, not runtime functions, so plain TS
// transpilation leaves them as undefined-function calls. Vite handles this
// for the real app via vite-plugin-svelte, which strips TS then runs the
// result through Svelte's `compileModule`; this transformer does the same
// two steps for Jest, then down-levels the compiled ESM output to
// CommonJS so Jest's CJS-based module runtime can execute it.
const ts = require('typescript')
const { compileModule } = require('svelte/compiler')

module.exports = {
  process(sourceText, sourcePath) {
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
