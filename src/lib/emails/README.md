# Transactional emails

Every email this app sends is authored here as [MJML](https://documentation.mjml.io),
compiled to HTML at build time, and filled in at send time with Handlebars.

```
src/lib/emails/
  templates/*.mjml     <- edit these
  layout/*.mjml        <- shared chrome, included by every template
  __goldens__/*.txt    <- committed regression gate (see Testing)
  render.ts            <- renderEmail(name, data)
  registry.ts          <- name -> compiled HTML
src/lib/data/emailTemplates/*.ts   <- GENERATED, do not edit
scripts/emails/                    <- build + verification tooling
```

## Changing an email

1. Edit the `.mjml` file. Only the content belongs there — the header, footer
   and `<mj-head>` come from `layout/`.
2. `yarn email:build` to regenerate `src/lib/data/emailTemplates/*.ts`.
3. `yarn test` — the goldens will fail, showing your copy change as a readable
   text diff.
4. `yarn email:goldens` to accept it, then commit the `.mjml`, the generated
   `.ts` and the golden together.

`yarn email:check` fails if the generated files are out of date with their
sources; run it in CI so a stale commit can't ship.

## Sending

```ts
import { renderEmail } from '$lib/emails/render'

const html = renderEmail('rejectionEmailTemplate', {
  app: { firstName, name: 'Portal', link: 'https://portal.gbstem.org' },
})
```

`footerYear` is filled in automatically — don't pass it, and don't hardcode a
year in the footer. Note it is deliberately **not** `app.year`:
`communityServiceEmailTemplate` already uses `app.year` for the _semester_
year, which is caller-supplied and unrelated.

### Interpolation rules

- `{{app.firstName}}` — HTML-escaped by Handlebars. Missing keys render empty.
- `{{url app.link}}` — **required for anything that lands in an `href`.** The
  helper allows only `http:`, `https:` and `mailto:`; everything else renders
  empty. The previous hand-rolled substituter escaped HTML but never looked at
  the scheme, so a `javascript:` URL in a link field reached the recipient's
  `href` in 9 of the 10 templates.

## Testing

Three layers, cheapest first:

| Command            | What it checks                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn test`        | Semantic goldens: the text, links, images and headings of every template against 4 fixtures each, plus an assertion that no fixture can produce executable content. |
| `yarn email:check` | The committed generated HTML matches the `.mjml` sources.                                                                                                           |
| `yarn email:audit` | Full before/after comparison, including screenshots and a pixel diff.                                                                                               |

The goldens deliberately ignore wrapper markup, so an MJML upgrade that changes
table scaffolding doesn't produce noise, while a changed sentence or a broken
link fails loudly. Fixtures live in `scripts/emails/fixtures.ts` and cover
production-shaped data, XSS probes, unicode/overlong values, and no data at all.

### The audit report

`yarn email:audit` renders every template on both the old and new engines,
screenshots each at 600px and 375px in headless Chrome, and writes
`.email-snapshots/report/index.html` — a page with, per template, the semantic
diff and a magenta-highlighted pixel diff. Differences are classified against
`scripts/emails/expected-drift.json`; anything not matching an entry there is
flagged as unexplained and the command exits non-zero.

The "before" side is rendered from a git ref (`EMAIL_BASELINE_REF`, default
`HEAD`) rather than the working tree, because the migration overwrites the files
it needs. Once the migration has landed, point it at the commit before it:

```sh
EMAIL_BASELINE_REF=<pre-migration-sha> yarn email:audit
```

Screenshots need Chrome (`CHROME_PATH` to override the search). Without it the
semantic comparison still runs; you just lose the pictures.

## Why MJML

The templates were already MJML output — someone compiled them once and pasted
the HTML into a `.ts` file, after which all 10 copies of the ~90-line chrome had
to be maintained by hand. Keeping MJML as the _source_ means the generated HTML
is nearly identical to what shipped before (the migration's worst pixel delta
was 0.02%, all of it the footer year), while `mj-include` reduces each template
to just its own content.

Do not add an HTML formatting pass to `scripts/emails/build.ts`. Prettier's HTML
parser rewrites the Outlook conditional comments these templates depend on
(`<!--[if mso | IE]>` becomes `<!--[if mso | IE ]>`, `<![endif]-->` becomes
`<! [endif]-->`), which silently breaks the Outlook fallback tables.

## Keeping `../admin` in sync

`admin` runs the same system. `src/lib/emails/layout/*.mjml` and
`scripts/emails/*` are byte-identical in both repos on purpose — change them
together. Four templates are also byte-identical in content
(`actionEmailTemplate`, `classReminderEmailTemplate`,
`inPersonClassEnrolledEmailTemplate`, `onlineClassEnrolledEmailTemplate`), and
`interviewScheduledEmailTemplate` differs only slightly; if you edit one of
those here, check whether `admin` needs the same edit.
