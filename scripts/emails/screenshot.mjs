/**
 * Screenshots every HTML file in a snapshot directory, at the two widths that
 * matter for email: 600px (the desktop client column these templates are built
 * for) and 375px (a phone).
 *
 * If Chrome is not installed the script says so and exits 0 - the semantic gate
 * still runs, you just lose the pictures.
 *
 *   node scripts/emails/screenshot.mjs before
 */
import { mkdir, readdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SNAPSHOT_ROOT } from './paths.mjs'
import { launchChrome, withPage } from './cdp.mjs'

export const WIDTHS = [
  { name: 'desktop', width: 600 },
  { name: 'mobile', width: 375 },
]

export async function captureAll(label) {
  const htmlDir = join(SNAPSHOT_ROOT, label, 'html')
  const shotDir = join(SNAPSHOT_ROOT, label, 'png')

  const session = await launchChrome(join(SNAPSHOT_ROOT, '.chrome-profile'))
  if (!session) {
    console.log(
      'No Chrome found - skipping screenshots. Set CHROME_PATH to enable the visual diff.',
    )
    return 0
  }

  const files = (await readdir(htmlDir))
    .filter((f) => f.endsWith('.html'))
    .sort()
  await rm(shotDir, { recursive: true, force: true })
  await mkdir(shotDir, { recursive: true })

  try {
    for (const file of files) {
      const name = file.replace(/\.html$/, '')
      const fileUrl = pathToFileURL(join(htmlDir, file)).href

      for (const { name: sizeName, width } of WIDTHS) {
        await withPage(session, async (page) => {
          const setViewport = (height) =>
            page.send('Emulation.setDeviceMetricsOverride', {
              width,
              height,
              deviceScaleFactor: 1,
              mobile: sizeName === 'mobile',
            })

          await setViewport(900)
          await page.send('Page.enable')
          // Wait for the load event, then size the viewport to the laid-out
          // content before capturing. A fixed sleep is not enough: it
          // intermittently caught a page mid-layout and clipped the screenshot
          // to the viewport, which then read as a large bogus pixel diff.
          const loaded = page.once('Page.loadEventFired')
          await page.send('Page.navigate', { url: fileUrl })
          await loaded

          const { cssContentSize } = await page.send('Page.getLayoutMetrics')
          const fullHeight = Math.max(
            900,
            Math.ceil(cssContentSize?.height ?? 900),
          )
          await setViewport(fullHeight)

          const { data } = await page.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: true,
          })
          await writeFile(
            join(shotDir, `${name}.${sizeName}.png`),
            Buffer.from(data, 'base64'),
          )
        })
      }
    }
  } finally {
    session.stop()
  }

  console.log(
    `[${label}] captured ${files.length * WIDTHS.length} screenshots to ${shotDir}`,
  )
  return files.length * WIDTHS.length
}

if (process.argv[1]?.endsWith('screenshot.mjs')) {
  const label = process.argv[2]
  if (!label) {
    console.error('usage: node scripts/emails/screenshot.mjs <label>')
    process.exit(1)
  }
  captureAll(label).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
