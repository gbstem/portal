/**
 * Builds the audit report for an email-template migration.
 *
 * For every template x fixture it compares two snapshot directories on three
 * levels, weakest gate to strongest:
 *
 *   semantic  what the recipient reads - text, links, images, headings. This
 *             is the gate: it must be empty or explained.
 *   visual    a pixel diff of the rendered screenshots at 600px and 375px.
 *   raw       byte size and line-level HTML delta, informational only, because
 *             two generators legitimately emit different table scaffolding.
 *
 * The pixel comparison runs inside the headless Chrome we already need for
 * screenshots - drawing both PNGs to a canvas and subtracting - so there is no
 * image-decoding dependency.
 *
 *   node scripts/emails/report.mjs before after
 */
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { SNAPSHOT_ROOT } from './paths.mjs'
import { launchChrome, withPage } from './cdp.mjs'
import { WIDTHS } from './screenshot.mjs'
import expectedDrift from './expected-drift.json' with { type: 'json' }

/**
 * Differences this migration is known to introduce. A diff line matching one of
 * these is reported as explained; anything else is an unexplained regression
 * and is what the reviewer should actually be looking at.
 */
const EXPECTED = expectedDrift.expected.map((e) => ({
  ...e,
  re: new RegExp(e.pattern),
}))

const explain = (line) => EXPECTED.find((e) => e.re.test(line)) ?? null

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Unified-diff style comparison of two line arrays, longest-common-subsequence free. */
function lineDiff(a, b) {
  const aSet = new Map()
  for (const line of a) aSet.set(line, (aSet.get(line) ?? 0) + 1)
  const removed = []
  const added = []
  const bSet = new Map()
  for (const line of b) bSet.set(line, (bSet.get(line) ?? 0) + 1)
  for (const [line, count] of aSet) {
    const extra = count - (bSet.get(line) ?? 0)
    for (let i = 0; i < extra; i++) removed.push(line)
  }
  for (const [line, count] of bSet) {
    const extra = count - (aSet.get(line) ?? 0)
    for (let i = 0; i < extra; i++) added.push(line)
  }
  return { removed, added }
}

/**
 * Draws both screenshots on a canvas and returns the fraction of differing
 * pixels plus a diff image highlighting them in magenta.
 */
const DIFF_SCRIPT = (beforeUri, afterUri) => `
(async () => {
  const load = (src) => new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('decode failed'))
    img.src = src
  })
  const [a, b] = await Promise.all([load(${JSON.stringify(beforeUri)}), load(${JSON.stringify(afterUri)})])
  const w = Math.max(a.width, b.width)
  const h = Math.max(a.height, b.height)
  const draw = (img) => {
    const c = new OffscreenCanvas(w, h)
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, w, h)
  }
  const da = draw(a), db = draw(b)
  const out = new ImageData(w, h)
  let differing = 0
  for (let i = 0; i < da.data.length; i += 4) {
    const dr = Math.abs(da.data[i] - db.data[i])
    const dg = Math.abs(da.data[i+1] - db.data[i+1])
    const dbl = Math.abs(da.data[i+2] - db.data[i+2])
    // A small tolerance absorbs antialiasing noise without hiding real change.
    if (dr + dg + dbl > 24) {
      differing++
      out.data[i] = 255; out.data[i+1] = 0; out.data[i+2] = 255; out.data[i+3] = 255
    } else {
      const grey = 255 - (255 - da.data[i]) * 0.15
      out.data[i] = grey; out.data[i+1] = grey; out.data[i+2] = grey; out.data[i+3] = 255
    }
  }
  const canvas = new OffscreenCanvas(w, h)
  canvas.getContext('2d').putImageData(out, 0, 0)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (const byte of buf) bin += String.fromCharCode(byte)
  return JSON.stringify({
    differing,
    total: w * h,
    ratio: differing / (w * h),
    sizeChanged: a.width !== b.width || a.height !== b.height,
    before: [a.width, a.height],
    after: [b.width, b.height],
    diffPng: btoa(bin),
  })
})()
`

async function pixelDiff(session, beforePath, afterPath) {
  const [beforeBuf, afterBuf] = await Promise.all([
    readFile(beforePath).catch(() => null),
    readFile(afterPath).catch(() => null),
  ])
  if (!beforeBuf || !afterBuf) return null

  const toUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`
  return withPage(session, async (page) => {
    const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
      expression: DIFF_SCRIPT(toUri(beforeBuf), toUri(afterBuf)),
      awaitPromise: true,
      returnByValue: true,
    })
    if (exceptionDetails) throw new Error(exceptionDetails.text)
    return JSON.parse(result.value)
  })
}

async function main() {
  const [beforeLabel = 'before', afterLabel = 'after'] = process.argv.slice(2)
  const beforeDir = join(SNAPSHOT_ROOT, beforeLabel)
  const afterDir = join(SNAPSHOT_ROOT, afterLabel)
  const reportDir = join(SNAPSHOT_ROOT, 'report')

  await rm(reportDir, { recursive: true, force: true })
  await mkdir(join(reportDir, 'img'), { recursive: true })

  const names = (await readdir(join(beforeDir, 'semantic')))
    .filter((f) => f.endsWith('.txt'))
    .map((f) => f.replace(/\.txt$/, ''))
    .sort()

  const session = await launchChrome(join(SNAPSHOT_ROOT, '.chrome-profile'))
  const rows = []

  try {
    for (const name of names) {
      const [beforeSem, afterSem] = await Promise.all([
        readFile(join(beforeDir, 'semantic', `${name}.txt`), 'utf8'),
        readFile(join(afterDir, 'semantic', `${name}.txt`), 'utf8'),
      ])
      const [beforeHtml, afterHtml] = await Promise.all([
        readFile(join(beforeDir, 'html', `${name}.html`), 'utf8'),
        readFile(join(afterDir, 'html', `${name}.html`), 'utf8'),
      ])

      const semantic = lineDiff(
        beforeSem.split('\n').filter(Boolean),
        afterSem.split('\n').filter(Boolean),
      )

      const visuals = []
      for (const { name: sizeName } of WIDTHS) {
        if (!session) continue
        const diff = await pixelDiff(
          session,
          join(beforeDir, 'png', `${name}.${sizeName}.png`),
          join(afterDir, 'png', `${name}.${sizeName}.png`),
        )
        if (!diff) continue
        const file = `${name}.${sizeName}.diff.png`
        await writeFile(
          join(reportDir, 'img', file),
          Buffer.from(diff.diffPng, 'base64'),
        )
        visuals.push({ size: sizeName, ...diff, file })
      }

      const lines = [
        ...semantic.removed.map((l) => `-${l}`),
        ...semantic.added.map((l) => `+${l}`),
      ].map((l) => ({ line: l, expected: explain(l) }))

      rows.push({
        name,
        semantic,
        lines,
        unexplained: lines.filter((l) => !l.expected),
        visuals,
        bytes: { before: beforeHtml.length, after: afterHtml.length },
      })
      process.stdout.write(`  compared ${name}\n`)
    }
  } finally {
    session?.stop()
  }

  const semanticClean = rows.filter((r) => !r.lines.length)
  const unexplained = rows.filter((r) => r.unexplained.length)
  const worstVisual = Math.max(
    0,
    ...rows.flatMap((r) => r.visuals.map((v) => v.ratio)),
  )
  const reasons = [
    ...new Set(
      rows.flatMap((r) =>
        r.lines.map((l) => l.expected?.reason).filter(Boolean),
      ),
    ),
  ]

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Email migration audit - ${esc(beforeLabel)} vs ${esc(afterLabel)}</title>
<style>
  :root { color-scheme: light dark; --fg:#111; --bg:#fff; --muted:#666; --line:#ddd;
          --add:#0a7c2f; --del:#b3261e; --card:#fafafa; }
  @media (prefers-color-scheme: dark) {
    :root { --fg:#e6e6e6; --bg:#141414; --muted:#9a9a9a; --line:#333;
            --add:#5ddb8b; --del:#ff8a80; --card:#1c1c1c; }
  }
  body { margin:0; padding:2rem; background:var(--bg); color:var(--fg);
         font:14px/1.5 ui-sans-serif, system-ui, sans-serif; }
  h1 { font-size:1.4rem; margin:0 0 .25rem; }
  .sub { color:var(--muted); margin-bottom:1.5rem; }
  .summary { display:flex; gap:1rem; flex-wrap:wrap; margin-bottom:2rem; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:8px;
          padding:.75rem 1rem; min-width:150px; }
  .stat b { display:block; font-size:1.5rem; }
  details { border:1px solid var(--line); border-radius:8px; margin-bottom:.75rem;
            background:var(--card); }
  summary { padding:.75rem 1rem; cursor:pointer; font-weight:600; }
  .body { padding:0 1rem 1rem; }
  pre { background:var(--bg); border:1px solid var(--line); border-radius:6px;
        padding:.75rem; overflow-x:auto; font-size:12px; }
  .del { color:var(--del); } .add { color:var(--add); }
  .clean { color:var(--muted); }
  .shots { display:flex; gap:1rem; overflow-x:auto; }
  .shots figure { margin:0; flex:0 0 auto; }
  .shots img { max-width:280px; border:1px solid var(--line); display:block; }
  figcaption { color:var(--muted); font-size:12px; padding-top:.25rem; }
  .pill { font-weight:400; font-size:12px; color:var(--muted); }
  .warn { color:var(--del); font-weight:700; }
  .stat.good b { color:var(--add); } .stat.bad b { color:var(--del); }
  h2 { font-size:1rem; margin:2rem 0 .5rem; }
  .reasons { color:var(--muted); padding-left:1.2rem; margin:0 0 1rem; }
  .reasons li { margin-bottom:.35rem; }
</style>
<h1>Email migration audit</h1>
<div class="sub"><code>${esc(beforeLabel)}</code> &rarr; <code>${esc(afterLabel)}</code> &middot; ${rows.length} template &times; fixture combinations</div>
<div class="summary">
  <div class="stat ${unexplained.length ? 'bad' : 'good'}"><b>${unexplained.length}</b>unexplained differences</div>
  <div class="stat"><b>${semanticClean.length}/${rows.length}</b>byte-identical semantics</div>
  <div class="stat"><b>${(worstVisual * 100).toFixed(2)}%</b>worst pixel delta</div>
  <div class="stat"><b>${rows.reduce((n, r) => n + r.lines.length, 0)}</b>semantic lines changed</div>
</div>
${
  reasons.length
    ? `<h2>Expected differences</h2>
<ol class="reasons">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`
    : ''
}
<h2>Per template</h2>
${rows
  .map((r) => {
    const worst = Math.max(0, ...r.visuals.map((v) => v.ratio))
    const status = r.unexplained.length
      ? `${r.unexplained.length} UNEXPLAINED`
      : r.lines.length
        ? `${r.lines.length} expected line(s)`
        : 'semantically identical'
    return `<details${r.unexplained.length ? ' open' : ''}>
  <summary>${r.unexplained.length ? '&#9888; ' : ''}${esc(r.name)}
    <span class="pill">&mdash; ${status},
    ${(worst * 100).toFixed(2)}% pixels, ${r.bytes.before} &rarr; ${r.bytes.after} bytes</span>
  </summary>
  <div class="body">
    ${
      r.lines.length
        ? `<pre>${r.lines
            .map(
              ({ line, expected }) =>
                `<span class="${line.startsWith('-') ? 'del' : 'add'}">${esc(line)}</span>` +
                (expected
                  ? ''
                  : '  <span class="warn">&#9888; unexplained</span>'),
            )
            .join('\n')}</pre>`
        : `<p class="clean">No difference in text, links, images or headings.</p>`
    }
    <div class="shots">
      ${r.visuals
        .map(
          (v) => `<figure>
        <img src="img/${esc(v.file)}" alt="pixel diff, ${esc(v.size)}">
        <figcaption>${esc(v.size)} &middot; ${(v.ratio * 100).toFixed(2)}% differing${
          v.sizeChanged
            ? ` &middot; size ${v.before.join('x')} &rarr; ${v.after.join('x')}`
            : ''
        }</figcaption>
      </figure>`,
        )
        .join('')}
    </div>
  </div>
</details>`
  })
  .join('\n')}
`
  await writeFile(join(reportDir, 'index.html'), html, 'utf8')
  console.log(
    `\nReport: ${join(reportDir, 'index.html')}\n` +
      `  ${unexplained.length} unexplained difference(s)\n` +
      `  ${semanticClean.length}/${rows.length} byte-identical semantics, worst pixel delta ${(worstVisual * 100).toFixed(2)}%`,
  )
  if (unexplained.length) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
