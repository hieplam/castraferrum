/// <reference lib="dom" />
// Toolkit for "real app next to the approved preview" shots — every UI story has one file `tests/visual/<screen>.visual.ts`
// that uses it:
//
//   test.use(PREVIEW_VIEW);
//   await snap(page, 'list-overview', 'description', [regions.topbar(), regions.main()]);   // light + dark, compare + assert the threshold
//   test.afterAll(() => writeReport('shell'));                                               // merge every file → index.html
//
// Compares each REGION the story owns (`regions.*` or a custom `{ name, selector, mask }`); parts owned by another story
// are masked. Output in `<LOOPS_COMPARE_OUT>/` (default reports/compare — `npm run verify`; `npm run design:compare`
// writes design/compare/): shots/ (app images), diff/, results/<file>.json, report.json + index.html merged from every
// results/*.json.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { messagesJs, readPreviewData, scheduleJs } from '../../scripts/design-states.mjs';
import * as schedule from '../../shared/domain/schedule';
import { en, type MessageKey } from '../../shared/i18n/en';
import { vi } from '../../shared/i18n/vi';
import { compareRegions, MAX_RATIO, type Rect, type Region, type RegionResult } from './pixel-diff';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const OUT = resolve(ROOT, process.env.LOOPS_COMPARE_OUT ?? 'reports/compare');
/** The reference = the approved preview shots. */
export const PREVIEW_SHOTS = join(ROOT, 'design', 'preview', 'shots');
export { MAX_RATIO };
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/** Viewport + time zone of the preview (design-shots.mjs shoots at 1440×900, deviceScaleFactor 1). */
export const PREVIEW_VIEW = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: 'Asia/Ho_Chi_Minh', colorScheme: 'light' as const };

/** An English UI text from shared/i18n/en.ts with `{x}` filled in like the app does. */
export function tEn(key: MessageKey, params: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/**
 * design/preview/messages.js and schedule.js are build output of `npm run design:shots` (git-ignored). Some visual tests
 * open the preview page itself (to copy its scroll positions), so write both from their sources when they are missing or
 * stale — the same content design-shots.mjs writes.
 */
function ensurePreviewBuild(): void {
  const dir = join(ROOT, 'design', 'preview');
  const pv = readPreviewData(readFileSync(join(dir, 'data.js'), 'utf8'));
  const files: Record<string, string> = { 'messages.js': messagesJs(en, vi), 'schedule.js': scheduleJs(pv, schedule) };
  for (const [name, content] of Object.entries(files)) {
    const file = join(dir, name);
    if (!existsSync(file) || readFileSync(file, 'utf8') !== content) writeFileSync(file, content);
  }
}
ensurePreviewBuild();

/**
 * Region to compare: chosen by a CSS selector on the app page (the preview has the same layout, so the same
 * coordinates); `mask` = selectors that are masked; `until` = cut the region at the top edge of this element (the part
 * below differs because the sample data of the preview draws fewer rows); `toPreviewBottom` = cut the region at the
 * bottom of the preview image (a column that runs the whole page height, like the list pane: the app page is taller than
 * the preview only because the main pane has more rows than the sample data).
 */
export type RegionSpec = { name: string; selector: string; mask?: string[]; until?: string; toPreviewBottom?: boolean };
export const regions = {
  /** Top bar, with the overview figures masked. */
  topbar: (): RegionSpec => ({ name: 'top bar (figures masked)', selector: 'header.topbar', mask: ['.topstats'] }),
  topbarAll: (): RegionSpec => ({ name: 'top bar', selector: 'header.topbar' }),
  banner: (): RegionSpec => ({ name: 'banner', selector: '.app > .banner' }),
  main: (): RegionSpec => ({ name: 'main pane', selector: '.pane-main' }),
  list: (): RegionSpec => ({ name: 'list pane', selector: '.pane-list' }),
  back: (): RegionSpec => ({ name: '← List button', selector: '.back-link' }),
};

type Shot = { id: string; theme: Theme; title: string; regions: RegionResult[] };
const shots: Shot[] = [];

export async function setTheme(page: Page, theme: Theme): Promise<void> {
  const html = page.locator('html');
  // dispatchEvent: the theme still switches when a dialog (the .scrim overlay) covers the top bar.
  if ((await html.getAttribute('data-theme')) !== theme) await page.getByTestId('toggle-theme').dispatchEvent('click');
  await expect(html).toHaveAttribute('data-theme', theme);
}

/** Switches the UI language with the real top-bar toggle and waits for `<html lang>`. */
export async function setLang(page: Page, lang: 'en' | 'vi'): Promise<void> {
  const html = page.locator('html');
  if ((await html.getAttribute('lang')) !== lang) await page.getByTestId('toggle-lang').dispatchEvent('click');
  await expect(html).toHaveAttribute('lang', lang);
}

async function box(page: Page, selector: string): Promise<Rect> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`cannot find ${selector}`);
  return b;
}

async function resolveRegions(page: Page, specs: RegionSpec[]): Promise<Region[]> {
  const out: Region[] = [];
  for (const s of specs) {
    const rect = await box(page, s.selector);
    if (s.until) rect.height = Math.max(0, (await box(page, s.until)).y - rect.y);
    out.push({ name: s.name, rect, mask: await Promise.all((s.mask ?? []).map((m) => box(page, m))) });
  }
  return out;
}

/** Shoots state `id` in light then dark, compares each region with `design/preview/shots/<id>-<theme>.png`, asserts the threshold. */
export async function snap(page: Page, id: string, title: string, specs: RegionSpec[]): Promise<void> {
  mkdirSync(join(OUT, 'shots'), { recursive: true });
  mkdirSync(join(OUT, 'diff'), { recursive: true });
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await page.evaluate(() => document.fonts.ready);
    // When the page is taller than the viewport, Chromium anti-aliases text differently in a full-page shot → stretch the
    // app page to the height of the preview image before shooting (measured: the "← List" button went from 5.08 % off to
    // 0.00 %). The compared regions do not change.
    const expected = join(PREVIEW_SHOTS, `${id}-${theme}.png`);
    const { width, height } = PNG.sync.read(readFileSync(expected));
    // A preview image exactly as tall as the viewport = the preview shot the viewport only (`fixed` in states.js: dialogs,
    // toasts — a fixed overlay only covers the viewport) or the page fits the viewport → shoot the app viewport only too,
    // and cut the regions at the viewport.
    const view = page.viewportSize();
    // A preview image WIDER than the viewport = the preview page overflows sideways (at 960px the db lamp of the top bar
    // overflows to 995px) → design-shots shot the full page, Playwright widened the viewport to the page and redrew → shoot
    // the full app page too, so it is drawn the same way.
    const fixed = view !== null && height === view.height && width === view.width;
    if (!fixed) await page.evaluate((h) => (document.body.style.minHeight = `${h}px`), height);
    const actual = join(OUT, 'shots', `${id}-${theme}.png`);
    await page.screenshot({ path: actual, fullPage: !fixed, animations: 'disabled', caret: 'hide' });
    await page.evaluate(() => (document.body.style.minHeight = ''));
    const resolved = await resolveRegions(page, specs);
    if (fixed && view) for (const r of resolved) r.rect.height = Math.max(0, Math.min(r.rect.height, view.height - r.rect.y));
    resolved.forEach((r, i) => {
      if (specs[i]?.toPreviewBottom) r.rect.height = Math.max(0, Math.min(r.rect.height, height - r.rect.y));
    });
    const result = compareRegions(expected, actual, resolved, join(OUT, 'diff', `${id}-${theme}.png`));
    shots.push({ id, theme, title, regions: result });
    for (const r of result) {
      expect.soft(r.ratio, `${id}-${theme} · ${r.name}: ${(r.ratio * 100).toFixed(2)} % off (${r.mismatched}/${r.pixels} px)`).toBeLessThanOrEqual(MAX_RATIO);
    }
  }
  await setTheme(page, 'light');
}

/** Writes the results of this file (`results/<file>.json`), then rebuilds report.json + index.html from every file. */
export function writeReport(file: string): void {
  if (!shots.length) return;
  mkdirSync(join(OUT, 'results'), { recursive: true });
  writeFileSync(join(OUT, 'results', `${file}.json`), `${JSON.stringify(shots, null, 2)}\n`);
  // The *.visual.ts files run one after the other in the SAME worker (workers: 1) → this array is shared: empty it once
  // written so the next file does not copy the shots of the previous one into its results.
  shots.splice(0);
  const all: Shot[] = readdirSync(join(OUT, 'results'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => JSON.parse(readFileSync(join(OUT, 'results', f), 'utf8')) as Shot[]);
  const worst = Math.max(...all.flatMap((s) => s.regions.map((r) => r.ratio)));
  const report = {
    maxRatio: MAX_RATIO,
    worstRatio: Number(worst.toFixed(5)),
    pairs: all.length,
    shots: all.map((s) => ({ id: s.id, theme: s.theme, regions: s.regions.map((r) => ({ name: r.name, mismatched: r.mismatched, pixels: r.pixels, ratio: Number(r.ratio.toFixed(5)) })) })),
  };
  writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const rel = (p: string) => relative(OUT, p).split('\\').join('/');
  const pct = (r: number) => `${(r * 100).toFixed(3)} %`;
  const rows = all
    .map((s) => {
      const nums = s.regions.map((r) => `<li class="${r.ratio > MAX_RATIO ? 'bad' : ''}">${r.name}: <b>${pct(r.ratio)}</b> <span>(${r.mismatched} / ${r.pixels} px)</span></li>`).join('');
      return `<section><h2>${s.id} · ${s.theme}</h2><p>${s.title}</p><ul>${nums}</ul><div class="row">
<figure><figcaption>approved preview</figcaption><img src="${rel(join(PREVIEW_SHOTS, `${s.id}-${s.theme}.png`))}" loading="lazy"></figure>
<figure><figcaption>real app</figcaption><img src="shots/${s.id}-${s.theme}.png" loading="lazy"></figure>
<figure><figcaption>diff (red = off, grey = masked, faded = not compared)</figcaption><img src="diff/${s.id}-${s.theme}.png" loading="lazy"></figure></div></section>`;
    })
    .join('\n');
  writeFileSync(
    join(OUT, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Castraferrum — app next to the preview</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:16px 24px;background:#f4f1ea;color:#22201b}h1{font-size:20px}section{margin:24px 0;border-top:1px solid #d9d2c3;padding-top:12px}
h2{font:600 15px ui-monospace,monospace;margin:0}p{margin:4px 0;color:#6f6858}ul{margin:4px 0 8px;padding-left:18px;font:12px ui-monospace,monospace}li.bad{color:#b42318}li span{color:#a39b89}
.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0}figcaption{font:12px ui-monospace,monospace;color:#6f6858;margin-bottom:4px}img{width:100%;border:1px solid #d9d2c3}</style></head>
<body><h1>Castraferrum — approved preview · real app · diff</h1><p>Written by <code>npm run design:compare</code> (<code>tests/visual/</code>). Threshold per region ≤ ${pct(MAX_RATIO)}; worst ${pct(worst)}; ${all.length} image pairs. Only the regions of screens that are built are compared — parts of stories not built yet are masked or not compared.</p>
${rows}</body></html>\n`,
  );
}
