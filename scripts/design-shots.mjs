// npm run design:shots [-- --only id1,id2] [-- --theme light|dark] — shoots the design preview.
// 1. Writes design/preview/messages.js from shared/i18n/en.ts + vi.ts (UI texts) and design/preview/schedule.js from
//    shared/domain/schedule.ts (schedule sentences, warnings, cron errors, next runs) — the preview never writes these
//    itself. Both are build output (git-ignored).
// 2. Opens design/preview/app.html?state=<id>&theme=<t> in Playwright's Chromium for every state of
//    design/preview/states.js, waits for the fonts, shoots the whole page (animations off) → design/preview/shots/<id>-<t>.png.
// A page that reports a problem (missing i18n key, cannot draw, JS error) → that image is not written, the problem is
// printed, exit 1. Needs the network the first time: tokens.css loads IBM Plex from Google Fonts. Check the full set with
// npm run design:states.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { DEFAULT_DESIGN, THEMES, generatedFiles, readPreviewStates } from './design-states.mjs';

const { values } = parseArgs({ options: { only: { type: 'string' }, theme: { type: 'string' } } });
const preview = join(DEFAULT_DESIGN, 'preview');
const shots = join(preview, 'shots');
mkdirSync(shots, { recursive: true });

for (const [name, content] of Object.entries(await generatedFiles())) {
  writeFileSync(join(preview, name), content);
  console.log(`${name}: written (${name === 'messages.js' ? 'en + vi keys of shared/i18n' : 'schedule sentences + next runs from shared/domain/schedule.ts'})`);
}

let states = readPreviewStates(readFileSync(join(preview, 'states.js'), 'utf8'));
if (values.only) { const only = values.only.split(','); states = states.filter((s) => only.includes(s.id)); }
const themes = values.theme ? [values.theme] : THEMES;

const browser = await chromium.launch();
let bad = 0, n = 0;
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
    if (problems.length) {
      bad++;
      console.log(`  ✗ ${s.id} ${theme}: ${problems.join(' · ')}`);
    } else {
      await page.screenshot({ path: join(shots, `${s.id}-${theme}.png`), fullPage: !s.fixed, animations: 'disabled', caret: 'hide' });
      n++;
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(`shot ${n} images${bad ? `, ${bad} pages with problems` : ''} → design/preview/shots/`);
process.exitCode = bad ? 1 : 0;
