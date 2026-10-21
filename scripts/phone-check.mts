// npm run phone:check [-- --ui new] [--max k]
// Does any screen scroll sideways on a phone or a tablet? (UI uplift, task U0.) Starts its own test-mode server
// (tests/support/server-process.ts, needs `npm run build` first: the server serves dist/web), seeds one repo and two loops
// through the API (one running on the Mock executor with a finished run, one stopped), then opens six screens in Chromium
// at 390x844 and 768x1024 (isMobile, hasTouch). On each screen it measures the `scrollWidth` of the document against the
// viewport width, plus any visible element whose right edge passes the viewport and whose nearest scrolling ancestor is the document.
// Prints `<screen>@<width>: ok` or `<screen>@<width>: overflow <px>px (<selector>)`, then `phone overflow: k/12`.
// `--ui new` opens every URL with `?ui=new`; `--max k` exits 1 above k.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { ServerProcess } from '../tests/support/server-process.ts';
import { TEST_REPO } from '../tests/support/test-repo.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SIZES = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
];

export type Overflow = { px: number; selector: string };

// Runs in the page with the device width `vw`. Kept as a string so no compiler helper leaks into the browser. The width
// comes from the Playwright viewport: with isMobile, Chromium widens the layout viewport (innerWidth) to fit content that
// overflows, so innerWidth alone would hide every overflow.
const MEASURE = `((vw) => {
  const de = document.documentElement;
  let worst = 0;
  let worstEl = null;
  for (const el of Array.from(document.body ? document.body.querySelectorAll('*') : [])) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.right <= vw + 0.5) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let a = el.parentElement;
    let scroller = false;
    while (a && a !== document.body && a !== de) {
      if (getComputedStyle(a).overflowX !== 'visible') { scroller = true; break; }
      a = a.parentElement;
    }
    if (scroller) continue;
    const over = Math.ceil(r.right - vw);
    if (over > worst) { worst = over; worstEl = el; }
  }
  const doc = Math.max(0, de.scrollWidth - vw);
  if (doc === 0 && worst === 0) return null;
  const describe = (e) => {
    if (!e) return 'html';
    const id = e.id ? '#' + e.id : '';
    const tid = e.getAttribute('data-testid') ? '[data-testid="' + e.getAttribute('data-testid') + '"]' : '';
    const cls = e.classList.length ? '.' + Array.from(e.classList).slice(0, 2).join('.') : '';
    return e.tagName.toLowerCase() + id + tid + cls;
  };
  return { px: Math.max(doc, worst), selector: describe(worstEl) };
})`;

/** How far the page scrolls sideways, and the element that pushes it furthest; null when it fits. */
export async function overflowOf(page: Page): Promise<Overflow | null> {
  const vw = page.viewportSize()?.width ?? 0;
  return (await page.evaluate(`(${MEASURE})(${vw})`)) as Overflow | null;
}

type Loop = { id: string; currentExecution: { id: string } | null; lastRun: { id: string; status: string } | null };

async function seed(sp: ServerProcess): Promise<Record<string, string>> {
  const ok = <T,>(r: { status: number; body: T }, what: string): T => {
    if (r.status >= 300) throw new Error(`${what} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const repo = ok(await sp.api<{ id: string }>('POST', '/api/repos', { path: TEST_REPO.path, name: TEST_REPO.name }), 'POST /api/repos');
  const loop = (name: string) => ({
    repoId: repo.id, name, prompt: `Prompt of ${name}`, cron: '0 0 1 1 *', timeoutSec: 600,
    executor: { kind: 'mock', config: { durationSec: 1, failRate: 0 } },
  });
  const running = ok(await sp.api<Loop>('POST', '/api/loops', loop('Phone check running')), 'POST /api/loops');
  ok(await sp.api<Loop>('POST', '/api/loops', loop('Phone check stopped')), 'POST /api/loops');
  ok(await sp.api('POST', `/api/loops/${running.id}/start`), 'start');
  const deadline = Date.now() + 30_000;
  for (;;) {
    const l = ok(await sp.api<Loop>('GET', `/api/loops/${running.id}`), 'GET loop');
    if (l.lastRun && l.lastRun.status !== 'running' && l.currentExecution) {
      return {
        '/': '/', '/loops/new': '/loops/new', '/loops/:id': `/loops/${l.id}`, '/executions/:id': `/executions/${l.currentExecution.id}`,
        '/runs/:id': `/runs/${l.lastRun.id}`, '/repos': '/repos',
      };
    }
    if (Date.now() > deadline) throw new Error(`no finished run within 30 seconds: ${JSON.stringify(l)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { ui: { type: 'string' }, max: { type: 'string' } } });
  if (!existsSync(join(ROOT, 'dist', 'web', 'index.html'))) throw new Error('dist/web is missing: run `npm run build` first');
  const query = values.ui === 'new' ? '?ui=new' : '';
  const sp = await ServerProcess.launch();
  const browser = await chromium.launch();
  let bad = 0;
  let total = 0;
  try {
    const screens = await seed(sp);
    for (const size of SIZES) {
      const context = await browser.newContext({ viewport: size, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      for (const [screen, path] of Object.entries(screens)) {
        await page.goto(`${sp.baseUrl}${path}${query}`);
        await page.waitForFunction(() => document.querySelector('[data-testid="lamp-server"]')?.getAttribute('data-state') === 'ok');
        await page.waitForTimeout(300);
        const o = await overflowOf(page);
        total++;
        if (o) bad++;
        console.log(`${screen}@${size.width}: ${o ? `overflow ${o.px}px (${o.selector})` : 'ok'}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await sp.stop();
  }
  console.log(`phone overflow: ${bad}/${total}`);
  if (values.max !== undefined && bad > Number(values.max)) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exitCode = 2;
  });
}
