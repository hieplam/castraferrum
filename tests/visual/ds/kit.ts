/// <reference lib="dom" />
// Toolkit for "the app next to the approved preview" shots (UI uplift, task U13). Every screen task (U14 to U19) has one
// file `tests/visual/ds/<screen>.visual.ts` that uses it:
//
//   test.use(PREVIEW_VIEW);                                  // or PHONE_VIEW for the phone states
//   await snap(page, 'loops-list', 'description', [regions.topbar(), regions.page()]);   // light + dark, compare + assert
//   test.afterAll(() => writeReport('loops'));               // merge every file → index.html
//
// The reference is design/ds/preview/shots/<id>-<theme>.png. Output in `<LOOPS_COMPARE_OUT>/ds/` (default reports/compare/ds;
// `npm run design:compare` writes design/compare/ds/): shots/, diff/, results/<file>.json, report.json + index.html.
// Masks are test ids, and only the three of `MASKABLE` are allowed: a difference anywhere else is fixed, never hidden.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { compareRegions, MAX_RATIO, type Rect, type Region, type RegionResult } from '../pixel-diff';

export const OUT = join(resolve(import.meta.dirname, '..', '..', '..', process.env.LOOPS_COMPARE_OUT ?? 'reports/compare'), 'ds');
/** The reference = the approved shots of the new preview. */
export const DS_SHOTS = join(import.meta.dirname, '..', '..', '..', 'design', 'ds', 'preview', 'shots');
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/** Desktop states: the viewport and time zone of the preview shots (1440 by 900, deviceScaleFactor 1). */
export const PREVIEW_VIEW = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: 'Asia/Ho_Chi_Minh', colorScheme: 'light' as const };
/** Phone states: 390 by 844, deviceScaleFactor 1 (the preview's phone shots), touch. */
export const PHONE_VIEW = { ...PREVIEW_VIEW, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

/** Switches light / dark the way a viewer's system does (the new UI follows the system on Automatic) and waits for `html[data-theme]`. */
export async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/** Stores the UI language, reloads, and waits for `<html lang>`. */
export async function setLang(page: Page, lang: 'en' | 'vi'): Promise<void> {
  await page.evaluate((l) => window.localStorage.setItem('loop-console.lang', l), lang);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/** The only parts a comparison may mask: values that depend on the machine or the build, and the figure the preview contradicts (spec Q16). */
export const MASKABLE = ['settings-address', 'settings-version', 'stat-errors-24h'] as const;
type Maskable = (typeof MASKABLE)[number];

/** Region to compare: a CSS selector on the app page (the preview has the same layout, so the same coordinates); `mask` = test ids. */
export type RegionSpec = { name: string; selector: string; mask?: Maskable[] };
const region = (name: string, selector: string) => (mask: Maskable[] = []): RegionSpec => ({ name, selector, mask });
export const regions = {
  topbar: region('top bar', '.topbar'),
  tabbar: region('tab bar', '.tabbar'),
  navbar: region('navigation bar', '.navbar'),
  page: region('page', '.page'),
  actionbar: region('action bar', '.actionbar'),
  banner: region('banner', '.banner'),
  sheet: region('sheet', '.sheet'),
  dialog: region('dialog', '.dialog'),
  menu: region('menu', '.menu'),
  popover: region('popover', '.popover'),
  toast: region('toast', '.toast'),
};

/** Throws on a mask outside `MASKABLE` (a spec built by hand, or cast past the type). */
export function checkMasks(spec: RegionSpec): void {
  for (const m of spec.mask ?? []) {
    if (!(MASKABLE as readonly string[]).includes(m)) throw new Error(`${spec.name}: mask "${m}" is not allowed; only ${MASKABLE.join(', ')}`);
  }
}

async function box(page: Page, selector: string): Promise<Rect> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`cannot find ${selector}`);
  return b;
}

async function resolveRegions(page: Page, specs: RegionSpec[]): Promise<Region[]> {
  const out: Region[] = [];
  for (const s of specs) {
    checkMasks(s);
    out.push({ name: s.name, rect: await box(page, s.selector), mask: await Promise.all((s.mask ?? []).map((id) => box(page, `[data-testid="${id}"]`))) });
  }
  return out;
}

/** The visible fixed elements of a page taller than the viewport (a full-page shot paints them mid-page), as "tag.class". */
function midPageBars(): string[] {
  const tall = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  if (tall <= window.innerHeight) return [];
  return [...document.querySelectorAll('body *')]
    .filter((el) => getComputedStyle(el).position === 'fixed' && el.getBoundingClientRect().height > 0)
    .map((el) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')} (page ${tall}px, viewport ${window.innerHeight}px)`);
}

type Shot = { id: string; theme: Theme; title: string; regions: RegionResult[] };
const shots: Shot[] = [];

/** Shoots state `id` in light then dark, compares each region with `design/ds/preview/shots/<id>-<theme>.png`, asserts the threshold. */
export async function snap(page: Page, id: string, title: string, specs: RegionSpec[]): Promise<void> {
  specs.forEach(checkMasks);
  mkdirSync(join(OUT, 'shots'), { recursive: true });
  mkdirSync(join(OUT, 'diff'), { recursive: true });
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await page.evaluate(() => document.fonts.ready);
    const expected = join(DS_SHOTS, `${id}-${theme}.png`);
    const { width, height } = PNG.sync.read(readFileSync(expected));
    // A reference exactly the size of the viewport = a viewport shot; otherwise stretch the page to the
    // reference's height and shoot the full page, so text is drawn the same way. A full-page capture paints the fixed bars
    // (tab bar, action bar) where the first screen ends, over the content (castraferrum#198), so the viewport is also made
    // as tall as the reference for the shot, which puts them at the real bottom, as in the preview shot.
    const view = page.viewportSize();
    const fixed = view !== null && height === view.height && width === view.width;
    const grow = !fixed && view !== null && height > view.height;
    if (!fixed) await page.evaluate((h) => (document.body.style.minHeight = `${h}px`), height);
    if (grow) await page.setViewportSize({ width: view.width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    const midPage = fixed ? [] : await page.evaluate(midPageBars);
    expect.soft(midPage, `${id}-${theme}: fixed bars painted mid-page`).toEqual([]);
    const actual = join(OUT, 'shots', `${id}-${theme}.png`);
    await page.screenshot({ path: actual, fullPage: !fixed, animations: 'disabled', caret: 'hide' });
    const resolved = await resolveRegions(page, specs);
    if (grow) await page.setViewportSize(view);
    await page.evaluate(() => (document.body.style.minHeight = ''));
    if (fixed && view) for (const r of resolved) r.rect.height = Math.max(0, Math.min(r.rect.height, view.height - r.rect.y));
    const result = compareRegions(expected, actual, resolved, join(OUT, 'diff', `${id}-${theme}.png`));
    shots.push({ id, theme, title, regions: result });
    for (const r of result) {
      expect.soft(r.ratio, `${id}-${theme} · ${r.name}: ${(r.ratio * 100).toFixed(2)} % off (${r.mismatched}/${r.pixels} px)`).toBeLessThanOrEqual(MAX_RATIO);
    }
  }
  await setTheme(page, 'light');
}

/**
 * Every match of `pattern` in the text under `selector` (a match lies inside one text node) takes one line box: a count and
 * its word, a weekday name, a command never split across lines (castraferrum#186, castraferrum#191, castraferrum#195).
 * At least one match must be on the page, so an empty page fails.
 */
export async function expectOneLine(page: Page, selector: string, pattern: RegExp): Promise<void> {
  const found = await page.evaluate(
    ([sel, source, flags]) => {
      const re = new RegExp(source, flags.includes('g') ? flags : `${flags}g`);
      const out: { text: string; lines: number }[] = [];
      for (const root of document.querySelectorAll(sel)) {
        const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
          for (const m of n.data.matchAll(re)) {
            const r = document.createRange();
            r.setStart(n, m.index);
            r.setEnd(n, m.index + m[0].length);
            const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
            out.push({ text: m[0], lines: tops.size });
          }
        }
      }
      return out;
    },
    [selector, pattern.source, pattern.flags] as const,
  );
  expect(found.length, `no match of ${pattern} under ${selector}`).toBeGreaterThan(0);
  expect(found.filter((f) => f.lines > 1), `split across lines under ${selector}`).toEqual([]);
}

/** Writes the results of this file (`results/<file>.json`), then rebuilds report.json + index.html from every file. */
export function writeReport(file: string): void {
  if (!shots.length) return;
  mkdirSync(join(OUT, 'results'), { recursive: true });
  writeFileSync(join(OUT, 'results', `${file}.json`), `${JSON.stringify(shots, null, 2)}\n`);
  // The visual files share one worker (workers: 1): empty the array once written, so the next file starts clean.
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
<figure><figcaption>approved preview</figcaption><img src="${rel(join(DS_SHOTS, `${s.id}-${s.theme}.png`))}" loading="lazy"></figure>
<figure><figcaption>new UI</figcaption><img src="shots/${s.id}-${s.theme}.png" loading="lazy"></figure>
<figure><figcaption>diff (red = off, grey = masked, faded = not compared)</figcaption><img src="diff/${s.id}-${s.theme}.png" loading="lazy"></figure></div></section>`;
    })
    .join('\n');
  writeFileSync(
    join(OUT, 'index.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Castraferrum — new UI next to the preview</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:16px 24px;background:#f4f1ea;color:#22201b}h1{font-size:20px}section{margin:24px 0;border-top:1px solid #d9d2c3;padding-top:12px}
h2{font:600 15px ui-monospace,monospace;margin:0}p{margin:4px 0;color:#6f6858}ul{margin:4px 0 8px;padding-left:18px;font:12px ui-monospace,monospace}li.bad{color:#b42318}li span{color:#a39b89}
.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0}figcaption{font:12px ui-monospace,monospace;color:#6f6858;margin-bottom:4px}img{width:100%;border:1px solid #d9d2c3}</style></head>
<body><h1>Castraferrum — approved new preview · new UI · diff</h1><p>Written by <code>npm run design:compare</code> (<code>tests/visual/ds/</code>). Threshold per region ≤ ${pct(MAX_RATIO)}; worst ${pct(worst)}; ${all.length} image pairs.</p>
${rows}</body></html>\n`,
  );
}
