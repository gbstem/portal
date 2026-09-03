/**
 * A minimal Chrome DevTools Protocol client.
 *
 * Node 18+ ships a global `WebSocket` and `fetch`, so driving headless Chrome
 * needs no puppeteer/playwright dependency - which matters here because the
 * only thing we need a browser for is rendering email HTML and diffing two
 * PNGs, not automation.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

export function findChrome() {
  return CHROME_CANDIDATES.find((p) => existsSync(p)) ?? null
}

export class Cdp {
  #ws
  #id = 0
  #pending = new Map()
  #events = new Map()

  static async connect(url) {
    const client = new Cdp()
    client.#ws = new WebSocket(url)
    client.#ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method) {
        // A protocol event rather than a command reply.
        const waiters = client.#events.get(msg.method)
        if (waiters) {
          client.#events.delete(msg.method)
          for (const resolve of waiters) resolve(msg.params)
        }
        return
      }
      const waiter = client.#pending.get(msg.id)
      if (!waiter) return
      client.#pending.delete(msg.id)
      if (msg.error) waiter.reject(new Error(msg.error.message))
      else waiter.resolve(msg.result)
    })
    await new Promise((resolve, reject) => {
      client.#ws.addEventListener('open', resolve, { once: true })
      client.#ws.addEventListener(
        'error',
        () => reject(new Error('CDP socket failed')),
        {
          once: true,
        },
      )
    })
    return client
  }

  send(method, params = {}) {
    const id = ++this.#id
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#ws.send(JSON.stringify({ id, method, params }))
    })
  }

  /** Resolves the next time Chrome emits `method`, or after `timeoutMs`. */
  once(method, timeoutMs = 10_000) {
    return new Promise((resolve) => {
      const waiters = this.#events.get(method) ?? []
      waiters.push(resolve)
      this.#events.set(method, waiters)
      setTimeout(() => resolve(null), timeoutMs).unref?.()
    })
  }

  close() {
    this.#ws.close()
  }
}

async function waitForDebugger(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return (await res.json()).webSocketDebuggerUrl
    } catch {
      // Chrome has not opened the port yet.
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Chrome debugger did not come up on port ${port}`)
}

/**
 * Starts headless Chrome and returns `{ port, browser, stop }`. Remote fonts
 * are blocked so a slow or absent network cannot change how a page renders
 * between two runs of the same comparison.
 */
export async function launchChrome(profileDir) {
  const chrome = findChrome()
  if (!chrome) return null

  const port = 9222 + (process.pid % 500)
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-sandbox',
      '--no-first-run',
      '--disable-extensions',
      '--disable-remote-fonts',
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  const browser = await Cdp.connect(await waitForDebugger(port))
  return {
    port,
    browser,
    stop() {
      browser.close()
      proc.kill()
    },
  }
}

/** Opens a fresh page, hands it to `fn`, and always tears it down. */
export async function withPage(session, fn) {
  const { targetId } = await session.browser.send('Target.createTarget', {
    url: 'about:blank',
  })
  const page = await Cdp.connect(
    `ws://127.0.0.1:${session.port}/devtools/page/${targetId}`,
  )
  try {
    return await fn(page)
  } finally {
    page.close()
    await session.browser.send('Target.closeTarget', { targetId })
  }
}
