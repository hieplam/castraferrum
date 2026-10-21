// npm run design:shots [-- --only id1,id2] [-- --theme light|dark] [-- --design <folder>] [-- --dry] — shoots the design
// preview (design/preview by default; --design design/ds for the new preview of the UI uplift, epic #63).
// 1. Writes <folder>/preview/messages.js from shared/i18n/en.ts + vi.ts (UI texts) and <folder>/preview/schedule.js from
//    shared/domain/schedule.ts (schedule sentences, warnings, cron errors, next runs) — the preview never writes these
//    itself. Both are build output (git-ignored).
// 2. Opens <folder>/preview/app.html?state=<id>&theme=<t> in Playwright's Chromium for every state of
//    <folder>/preview/states.js (at its viewport), waits for the fonts, shoots the whole page (animations off) →
//    <folder>/preview/shots/<id>-<t>.png.
// A page that reports a problem (missing i18n key, cannot draw, JS error) → that image is not written, the problem is
// printed, exit 1. The classic preview needs the network the first time: design/tokens.css loads IBM Plex from Google
// Fonts; the new preview loads its fonts from node_modules (design/ds/fonts.css). Check the full set with
// npm run design:states.
// --dry draws every state in both themes and writes no image. A problem is also: a required test id (the state's
// `requires`, visible elements only) missing or with the wrong count, a class <folder>/components.css does not define,
// an inline style with a colour literal or a px, rem or em length. Prints "drawn <k> states x <t> themes, <n> problems";
// any problem → exit 1.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { cssClasses } from './design-lint.mjs';
import { DEFAULT_DESIGN, THEMES, checkDrawn, generatedFiles, readPreviewStates } from './design-states.mjs';

const { values } = parseArgs({ options: {
  only: { type: 'string' }, theme: { type: 'string' }, design: { type: 'string' }, dry: { type: 'boolean' },
} });
const designDir = values.design ? resolve(values.design) : DEFAULT_DESIGN;
const preview = join(designDir, 'preview');
const shots = join(preview, 'shots');
if (!values.dry) mkdirSync(shots, { recursive: true });

for (const [name, content] of Object.entries(await generatedFiles({ designDir }))) {
  writeFileSync(join(preview, name), content);
  console.log(`${name}: written (${name === 'messages.js' ? 'en + vi keys of shared/i18n' : 'schedule sentences + next runs from shared/domain/schedule.ts'})`);
}

let states = readPreviewStates(readFileSync(join(preview, 'states.js'), 'utf8'));
if (values.only) { const only = values.only.split(','); states = states.filter((s) => only.includes(s.id)); }
const themes = values.theme ? [values.theme] : THEMES;
const known = values.dry ? cssClasses(readFileSync(join(designDir, 'components.css'), 'utf8')) : null;

/** What the page shows: visible test ids with their counts, every class, every inline style. */
const snapshot = () => {
  const ids = {};
  for (const el of document.querySelectorAll('[data-testid]')) {
    if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
    ids[el.dataset.testid] = (ids[el.dataset.testid] ?? 0) + 1;
  }
  const classes = [...document.querySelectorAll('[class]')].flatMap((el) => [...el.classList]);
  const styles = [...document.querySelectorAll('[style]')].map((el) => el.getAttribute('style'));
  return { ids, classes, styles };
};

const browser = await chromium.launch();
let bad = 0, n = 0, problemCount = 0;
for (const s of states) {
  const [width, height] = s.vp ?? [1440, 900];
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  for (const theme of themes) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    const url = `${pathToFileURL(join(preview, 'app.html')).href}?state=${s.id}&theme=${theme}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const pv = await page.evaluate(() => window.__PV);
    const problems = [...errs, ...(pv?.problems ?? (pv ? [] : ['the page did not run preview.js']))];
    if (values.dry) problems.push(...checkDrawn(await page.evaluate(snapshot), { requires: s.requires, known }));
    if (problems.length) {
      bad++;
      problemCount += problems.length;
      console.log(`  ✗ ${s.id} ${theme}: ${problems.join(' · ')}`);
    } else if (!values.dry) {
      await page.screenshot({ path: join(shots, `${s.id}-${theme}.png`), fullPage: !s.fixed, animations: 'disabled', caret: 'hide' });
      n++;
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
if (values.dry) console.log(`drawn ${states.length} states x ${themes.length} themes, ${problemCount} problems`);
else console.log(`shot ${n} images${bad ? `, ${bad} pages with problems` : ''} → ${shots}`);
process.exitCode = bad ? 1 : 0;
