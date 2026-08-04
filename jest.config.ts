import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  transform: {
    // Rune-backed shared-state modules (src/lib/stores.svelte.ts) need the
    // Svelte compiler, not just TS transpilation - matched before the
    // general `.tsx?$` pattern below, which would otherwise also match.
    '\\.svelte$': '<rootDir>/jest-transform-svelte-module.cjs',
    '\\.svelte\\.(test\\.)?ts$': '<rootDir>/jest-transform-svelte-module.cjs',
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/__tests__/tsconfig.json' }],
    // The compiled output above imports Svelte's runtime straight from
    // `svelte/internal/client`, which ships as raw ESM (as does its own
    // `esm-env` dependency) - down-level both so Jest's CJS loader can
    // read them (paired with transformIgnorePatterns below, since
    // node_modules is untransformed by default).
    'node_modules[/\\\\](svelte|esm-env|lodash-es)[/\\\\].*\\.js$':
      '<rootDir>/jest-transform-esm-to-cjs.cjs',
  },
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\](?!(svelte|esm-env|lodash-es)[/\\\\])',
  ],
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx,svelte}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
}

export default config
