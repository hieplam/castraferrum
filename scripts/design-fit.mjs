// npm run design:fit — checks that every demo of the design-system page (design/ds/index.html) fits its frame.
// Opens the page in Playwright's Chromium at 1440x900 and 390x844 (light and dark are stacked on the page) and, inside
// every `.ds-stage`, counts the visible elements whose box leaves the stage at the top or the bottom. An element inside
// a scrolling box of the demo is reachable by scrolling and does not count, except the pinned bars of an overlay
// (`.dialog-head`, `.dialog-foot`, `.navbar`, `.picker-foot`). Also compares the page's scrollWidth with the window
// width (no sideways scroll). Prints "<w>x<h>: <n> elements outside their stage; scrollWidth <sw> / <w>" per window
// and the first offenders; any offender or sideways scroll → exit 1.
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch();
let bad = 0;
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(pathToFileURL(join(root, 'design/ds/index.html')).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500); // the layout settles after the fonts swap in
  const r = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.ds-stage').forEach((stage, i) => {
      const s = stage.getBoundingClientRect();
      for (const el of stage.querySelectorAll('*')) {
        if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
        let a = el.parentElement, scrolled = false;
        while (a && a !== stage) {
          const o = getComputedStyle(a);
          if (/(auto|scroll)/.test(o.overflowY + o.overflowX)) { scrolled = true; break; }
          a = a.parentElement;
        }
        if (scrolled && !el.matches('.picker-foot, .picker-foot *, .dialog-head, .dialog-foot, .navbar')) continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.top < s.top - 0.5 || b.bottom > s.bottom + 0.5) {
          const cls = typeof el.className === 'string' ? el.className : el.className.baseVal;
          out.push(`stage ${i} (${stage.className}): <${el.tagName.toLowerCase()} class="${cls}"> top ${Math.round(b.top - s.top)}, bottom ${Math.round(b.bottom - s.bottom)} px`);
        }
      }
    });
    return { out, sw: document.documentElement.scrollWidth };
  });
  bad += r.out.length + (r.sw !== w ? 1 : 0);
  console.log(`${w}x${h}: ${r.out.length} elements outside their stage; scrollWidth ${r.sw} / ${w}`);
  for (const line of r.out.slice(0, 12)) console.log(`  ${line}`);
  await page.close();
}
await browser.close();
process.exitCode = bad ? 1 : 0;
