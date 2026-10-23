// The new run page and its transcript (UI uplift, task U17) next to the approved new preview (design/ds/preview/shots/): the
// 20 states of spec 5.5 (17 desktop, 3 phone), light and dark = 40 pairs. Every state is rebuilt on the real app: a real server
// (really killed for the lost connection) with a temporary CLAUDE_CONFIG_DIR, the world of the new preview with its history seeded
// into the test database (tests/support/preview-world.ts with DS_DATA_JS), the transcripts of the new preview's data.js written
// as Claude Code JSONL files (tests/support/preview-transcripts.ts), the server and browser clocks at PREVIEW_NOW. The regions
// are the whole page (plus the navigation bar on the phone), and the toast of `run-resume-copied`. No mask.
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { en } from '../../../shared/i18n/en';
import { vi } from '../../../shared/i18n/vi';
import { previewTranscriptLength, writePreviewTranscript, type PreviewTranscriptKey } from '../../support/preview-transcripts';
import { DS_DATA_JS, PREVIEW_NOW, previewDirs, runId, seedPreviewWorld, sid } from '../../support/preview-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PHONE_VIEW, PREVIEW_VIEW, regions, setLang, snap, writeReport } from './kit';

/** The English text of a key of shared/i18n/en.ts with `{x}` filled in, like the app does. */
const tEn = (key: keyof typeof en, params: Record<string, string | number> = {}) =>
  en[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));

test.afterAll(() => writeReport('run'));

const NO_RUN = '3b9d1f40-7e2a-4c85-a6d3-9f0e1b2c4d57';
/** The runs of the states (spec 5.5), as the seeded world makes their ids. */
const RUN = {
  pilot69: runId('pilot', 69, ''),
  pilot68: runId('pilot', 68, ''),
  pilot63: runId('pilot', 63, ''),
  pilot59: runId('pilot', 59, ''),
  debt104: runId('debt', 104, ''),
  debtSkip: runId('debt', null, '14:00:00'),
  crash31: runId('crash', 31, ''),
  oldsched4: runId('oldsched', 4, ''),
  evidence4: runId('evidence', 4, ''),
};
const tx = (k: PreviewTranscriptKey) => previewTranscriptLength(k, DS_DATA_JS);

/** One server for a describe block, with its own CLAUDE_CONFIG_DIR; `world()` = a clean DB with the new preview's world and the clocks at PREVIEW_NOW. */
function useServer() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; world(page: Page): Promise<void>; write(k: PreviewTranscriptKey): void };
  test.beforeAll(async () => {
    const config = realpathSync(mkdtempSync(join(tmpdir(), 'cf-ds-run-')));
    ctx.sp = await ServerProcess.launch({ env: { CLAUDE_CONFIG_DIR: config } });
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    ctx.write = (k) => writePreviewTranscript(join(config, 'projects'), k, DS_DATA_JS);
    ctx.world = async (page) => {
      // Leave the app first: its reads would race the reset's TRUNCATE (castraferrum#170).
      await page.goto('about:blank');
      expect((await ctx.sp.api('POST', '/api/__test/reset')).status).toBe(204);
      // The server clock BEFORE seeding, or the ticker would run the runs that are already overdue.
      expect((await ctx.sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() })).status).toBe(200);
      expect((await ctx.sp.api('POST', '/api/__test/dirs', { paths: previewDirs(DS_DATA_JS) })).status).toBe(204);
      await seedPreviewWorld(ctx.db, { history: true }, DS_DATA_JS);
      await page.clock.setFixedTime(PREVIEW_NOW);
    };
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

/** Every font face the page uses is loaded (a face is fetched the first time text needs it; a killed server would fail the fetch). */
const fontsLoaded = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      ['400', '500', '600', '700']
        .map((w) => document.fonts.load(`${w} 14px "Be Vietnam Pro"`))
        .concat(['400', '500', '600'].map((w) => document.fonts.load(`${w} 14px "JetBrains Mono"`)))
        .concat([document.fonts.load('italic 400 14px "Be Vietnam Pro"')]),
    ),
  );

/** Park the pointer away from everything, so no hover state is drawn. */
const away = (page: Page) => page.mouse.move(1430, 890);

/** The preview is a still page: its transcript is scrolled to the top. The app's follows the bottom; scroll it like the preview. */
const scrollTxTop = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="run-transcript-scroll"]');
    if (el) el.scrollTop = 0;
    window.scrollTo(0, 0);
  });

const entries = (page: Page) => page.getByTestId('run-transcript').getByTestId('tx-entry');

/** The run page is drawn: its header with `status`, the log with `logLines` lines (0 = no log), the connection known. */
async function openRun(page: Page, base: string, id: string, o: { status: string; logLines: number; entries?: number; note?: string }) {
  await page.goto(`${base}/runs/${id}`);
  await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', o.status);
  if (o.logLines) await expect(page.getByTestId('run-log').locator(`.log-line[data-seq="${o.logLines}"]`)).toBeVisible();
  if (o.entries !== undefined) await expect(entries(page)).toHaveCount(o.entries, { timeout: 10_000 });
  if (o.note) await expect(page.getByTestId('run-transcript-note')).toHaveAttribute('data-mode', o.note);
  await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
  await fontsLoaded(page);
  await scrollTxTop(page);
  await away(page);
}

test.describe('desktop run page against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ ...PREVIEW_VIEW, permissions: ['clipboard-read', 'clipboard-write'] });
  const ctx = useServer();

  test('ended runs: missing transcript, succeeded, copied, failed, timed out, cancelled, interrupted', async ({ page }) => {
    test.setTimeout(240_000);
    await ctx.world(page);
    const base = ctx.sp.baseUrl;

    // Run #68 before its session file exists: the "not found" note.
    await openRun(page, base, RUN.pilot68, { status: 'succeeded', logLines: 2, note: 'missing' });
    await snap(page, 'run-transcript-missing', 'The session file is gone', [regions.page()]);

    for (const k of ['pilot68', 'debt104', 'pilot59', 'oldsched4', 'evidence4'] as const) ctx.write(k);

    await openRun(page, base, RUN.pilot68, { status: 'succeeded', logLines: 2, entries: tx('pilot68') });
    await expect(page.getByTestId('run-summary')).toBeVisible();
    await expect(page.getByTestId('run-resume-cmd')).toHaveText(`claude --resume ${sid('pilot', 68)}`);
    await expect(page.getByTestId('run-transcript-edge')).toHaveText(tEn('tx.end', { t: '13:53:04' }));
    await snap(page, 'run-succeeded', 'Succeeded: summary, cost, session, resume command; the prompt used differs from the current prompt', [regions.page()]);

    await page.getByTestId('run-resume-copy').click();
    await expect(page.locator('.toast')).toHaveText(tEn('run.copiedCommand', { id: sid('pilot', 68) }));
    await scrollTxTop(page);
    await away(page);
    await snap(page, 'run-resume-copied', 'Toast after Copy command', [regions.page(), regions.toast()]);

    // Run 104 ended with 52 entries, more than a page of 50: the last page, the older page held, so "Loading older entries".
    await page.route('**/transcript?before=*', () => undefined); // never answers
    await openRun(page, base, RUN.debt104, { status: 'failed', logLines: 2, entries: 50 });
    await expect(page.getByTestId('run-banner')).toBeVisible();
    await expect(page.getByTestId('run-transcript-edge').first()).toHaveText(tEn('tx.loadingOlderEntries'));
    await snap(page, 'run-failed', 'Failed with a process-level error', [regions.page()]);
    await page.unroute('**/transcript?before=*');

    await openRun(page, base, RUN.oldsched4, { status: 'timed_out', logLines: 2, entries: tx('oldsched4') });
    await expect(page.getByTestId('run-banner')).toBeVisible();
    await snap(page, 'run-timed-out', 'Timed out', [regions.page()]);

    await openRun(page, base, RUN.evidence4, { status: 'cancelled', logLines: 2, entries: tx('evidence4') });
    await expect(page.getByTestId('run-banner')).toBeVisible();
    await snap(page, 'run-cancelled', 'Cancelled by Stop', [regions.page()]);

    await openRun(page, base, RUN.pilot59, { status: 'interrupted', logLines: 1, entries: tx('pilot59') });
    await expect(page.getByTestId('run-banner')).toBeVisible();
    await snap(page, 'run-interrupted', 'Interrupted by a server shutdown', [regions.page()]);
  });

  test('skipped, no session, repo missing, Vietnamese transcript, loading, not found', async ({ page }) => {
    test.setTimeout(240_000);
    await ctx.world(page);
    const base = ctx.sp.baseUrl;

    await openRun(page, base, RUN.debtSkip, { status: 'skipped', logLines: 0, note: 'noSession' });
    await expect(page.getByTestId('skip-reason')).toBeVisible();
    await snap(page, 'run-skipped', 'Skipped: the reason, no session, no log', [regions.page()]);
    await snap(page, 'run-transcript-no-session', 'A run without a session (no transcript)', [regions.page()]);

    await openRun(page, base, RUN.crash31, { status: 'failed', logLines: 1, note: 'noSession' });
    await expect(page.getByTestId('run-repo-missing')).toBeVisible();
    await expect(page.getByTestId('open-repos')).toBeVisible();
    await snap(page, 'run-repo-missing', 'The repo folder is gone: the hint and Open Repos', [regions.page()]);

    ctx.write('pilot63');
    await page.goto(`${base}/runs/${RUN.pilot63}`);
    await setLang(page, 'vi');
    await expect(entries(page)).toHaveCount(tx('pilot63'));
    await expect(page.getByTestId('run-transcript-edge')).toHaveText(vi['tx.end'].replace('{t}', '11:01:04'));
    await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
    await fontsLoaded(page);
    await scrollTxTop(page);
    await away(page);
    await snap(page, 'vi-run-transcript', 'The transcript in Vietnamese', [regions.page()]);
    await setLang(page, 'en');

    await page.route(`**/api/runs/${RUN.pilot68}`, () => undefined); // never answers
    await page.goto(`${base}/runs/${RUN.pilot68}`);
    await expect(page.locator('.page [aria-busy="true"]')).toBeVisible();
    await expect(page.getByTestId('conn')).toHaveAttribute('data-db', 'ok');
    await fontsLoaded(page);
    await snap(page, 'run-loading', 'Skeleton', [regions.page()]);
    await page.unroute(`**/api/runs/${RUN.pilot68}`);

    await page.goto(`${base}/runs/${NO_RUN}`);
    await expect(page.getByRole('alert')).toContainText(tEn('error.RUN_NOT_FOUND'));
    await fontsLoaded(page);
    await snap(page, 'run-not-found', 'RUN_NOT_FOUND', [regions.page()]);
  });

  test('a running run: waiting for the file, following, lost connection', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    const base = ctx.sp.baseUrl;

    // Run #69 works; Claude has not written its file yet.
    await openRun(page, base, RUN.pilot69, { status: 'running', logLines: 1, note: 'waiting' });
    await snap(page, 'run-transcript-waiting', 'Waiting for the session file', [regions.page()]);

    // The file appears: the panel fills by itself (the server looks again every 500 ms).
    ctx.write('pilot69');
    await expect(entries(page)).toHaveCount(tx('pilot69'), { timeout: 10_000 });
    await expect(page.getByTestId('run-transcript')).toHaveAttribute('data-paused', 'false');
    await fontsLoaded(page);
    await scrollTxTop(page);
    await away(page);
    await snap(page, 'run-running', 'Running, live log', [regions.page()]);
    await snap(page, 'run-transcript-running', 'The transcript following a live session', [regions.page()]);

    await ctx.sp.kill();
    try {
      // attempt 1 (wait 1 second), attempt 2 (2 seconds), attempt 3 (4 seconds): exactly the text of the preview
      await expect(page.getByTestId('banner-disconnected')).toContainText(tEn('banner.lostRetry', { n: 3, s: 4 }), { timeout: 10_000 });
      await expect(page.getByTestId('run-transcript')).toHaveAttribute('data-paused', 'true');
      await expect(page.getByTestId('run-log')).toHaveAttribute('data-paused', 'true');
      await scrollTxTop(page);
      await snap(page, 'run-transcript-paused', 'Connection lost while following', [regions.page()]);
    } finally {
      await ctx.sp.start();
    }
  });
});

test.describe('phone run page against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.use(PHONE_VIEW);
  const ctx = useServer();
  const phone = () => [regions.navbar(), regions.page()];

  test('running with its transcript, succeeded', async ({ page }) => {
    test.setTimeout(180_000);
    await ctx.world(page);
    const base = ctx.sp.baseUrl;
    ctx.write('pilot69');
    ctx.write('pilot68');

    await openRun(page, base, RUN.pilot69, { status: 'running', logLines: 1, entries: tx('pilot69') });
    await expect(page.getByTestId('tabbar')).toHaveCount(0);
    await snap(page, 'phone-run-running', 'Running on the phone', phone());
    await snap(page, 'phone-run-transcript-running', 'The transcript on the phone: each entry a block', phone());

    await openRun(page, base, RUN.pilot68, { status: 'succeeded', logLines: 2, entries: tx('pilot68') });
    await expect(page.getByTestId('run-prompt')).toBeVisible();
    await snap(page, 'phone-run-succeeded', 'Succeeded on the phone', phone());
  });
});
