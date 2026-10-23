// node scripts/make-icons.mjs - renders the home screen icons of the console (UI uplift, task U24; spec 4.9) from
// web/public/icon.svg, the brand mark (the teal bar of the top bar) on the paper background: apple-touch-icon.png (180 px,
// iOS rounds the corners itself), icon-192.png and icon-512.png (the web app manifest). Draws the SVG full size in Playwright's
// Chromium and shoots it at each size. The PNGs are committed; run this again only when icon.svg changes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PUBLIC = fileURLToPath(new URL('../web/public/', import.meta.url));
const SIZES = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

const svg = readFileSync(`${PUBLIC}icon.svg`, 'utf8');
const browser = await chromium.launch();
try {
  for (const [file, size] of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const sized = svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
    await page.setContent(`<!doctype html><html><body style="margin:0">${sized}</body></html>`);
    await page.screenshot({ path: `${PUBLIC}${file}`, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`${file}: ${size}x${size}`);
  }
} finally {
  await browser.close();
}
