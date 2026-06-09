import { defineConfig } from 'cypress'
import installLogsPrinter from 'cypress-terminal-report/src/installLogsPrinter'
import fs from 'fs'
import path from 'path'

function loadEnv() {
  const env: Record<string, string> = {}
  for (const filename of ['.env', '.env.local']) {
    const filePath = path.resolve(process.cwd(), filename)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const match = trimmed.match(/^([^=]+)=(.*)$/)
        if (match) {
          const key = match[1].trim()
          let val = match[2].trim()
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1)
          }
          env[key] = val
        }
      }
    }
  }
  return { ...env, ...process.env }
}

const combinedEnv = loadEnv()

export default defineConfig({
  // Public, non-sensitive configuration values
  expose: {
    FIRESTORE_EMULATOR_HOST: combinedEnv.FIRESTORE_EMULATOR_HOST,
  },
  // Sensitive values like API keys, passwords, tokens, or credentials
  env: {},
  e2e: {
    baseUrl: 'http://localhost:5173',
    // Don't allow using the deprecated, insecure Cypress environment setup.
    allowCypressEnv: false,
    setupNodeEvents(on, config) {
      installLogsPrinter(on, {
        printLogsToConsole: 'onFail',
        printLogsToFile: 'always',
        includeSuccessfulHookLogs: false,
        outputRoot: config.projectRoot + '/cypress/logs/',
        outputTarget: {
          'out.json': 'json',
        },
      })
      on('task', {
        log(message) {
          console.log(message) // Print to the terminal
          return null
        },
      })
      return config
    },
  },
})
