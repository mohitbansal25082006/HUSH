# Contributing to HUSH

Thank you for helping make the web quieter.

## Report a missed ad or a broken site

Open an issue with the **Site problem** template. The most useful report is the one HUSH writes for you:

1. Open the site and click the HUSH icon.
2. Click **Site broken?**, then **Copy report**.
3. Paste the report into the issue.

## Fix it yourself

Most fixes are a line in `filters/hush.txt`, which uses the uBlock Origin / AdGuard filter syntax.

- Put site fixes under the **Site fixes** heading, with a comment saying what broke.
- Prefer site-specific filters (`example.com##.ad`) to generic ones (`##.ad`).
- To turn off an upstream filter on one site, use an exception, for example `example.com#@#+js(nostif, show)`.

Then run:

```bash
npm run filters:offline && npm run build
```

Reload the extension in `chrome://extensions` and check the site.

## Change the code

```bash
npm install
npx playwright install chromium
npm run filters
npm run check && npm test && npm run build && npm run test:e2e
```

- Match the style of the surrounding code, and keep comments about *why*, not *what*.
- Scriptlets in `src/scriptlets/library.js` must be self-contained: they are serialized and injected into pages, so they cannot use imports or outer variables.
- UI changes should keep the "Dusk" design: the tokens in `src/ui/theme.css`, the Bricolage Grotesque and Figtree fonts, and Hushy.
- Add a unit test for any parser change in `tests/unit/parser.test.ts`.
- Never commit `keys/`.

## Pull requests

- One topic per pull request.
- Describe what changed and how you tested it.
- CI must pass: type check, unit tests, build and end-to-end tests.

By contributing, you agree to license your work under GPL-3.0-or-later.
