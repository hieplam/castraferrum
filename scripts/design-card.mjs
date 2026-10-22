// npm run design:card — measures the height of the loop page's settings side card in the new preview (design/ds) and
// compares it with the approved board (design/reference/d-loop-light.png and d-loop-dark.png: the card spans y 438 to 966,
// 528 px). Opens state loop-running at 1440x900 in Playwright's Chromium, light and dark, finds the card around the
// prompt (`[data-testid="loop-prompt"]`) and prints "<state> settings card <theme>: <h> px (board 528, tolerance 40)".
// A card more than 40 px away from the board's height → exit 1. Options: --state <id> (default loop-running).
// Needs the generated preview/messages.js and preview/schedule.js; they are written first, as design:shots does.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { generatedFiles } from './design-states.mjs';

const BOARD_PX = 528, TOLERANCE_PX = 40;
const { values } = parseArgs({ options: { state: { type: 'string', default: 'loop-running' } } });
const designDir = resolve('design/ds');
const preview = join(designDir, 'preview');
for (const [name, content] of Object.entries(await generatedFiles({ designDir }))) writeFileSync(join(preview, name), content);

const browser = await chromium.launch();
let bad = 0;
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${pathToFileURL(join(preview, 'app.html')).href}?state=${values.state}&theme=${theme}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300); // the layout settles after the fonts swap in
  const h = await page.evaluate(() => document.querySelector('[data-testid="loop-prompt"]')?.closest('.card')?.getBoundingClientRect().height ?? null);
  const ok = h !== null && Math.abs(h - BOARD_PX) <= TOLERANCE_PX;
  if (!ok) bad++;
  console.log(`${values.state} settings card ${theme}: ${h === null ? 'not found' : `${Math.round(h)} px`} (board ${BOARD_PX}, tolerance ${TOLERANCE_PX})${ok ? '' : ' - OUT'}`);
  await page.close();
}
await browser.close();
process.exitCode = bad ? 1 : 0;
