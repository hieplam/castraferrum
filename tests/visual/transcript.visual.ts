// Shots of the REAL Transcript panel of the run screen next to the 7 approved preview states (`run-transcript-*`,
// `vi-run-transcript` — design/STATES.md D-UI27…D-UI33) + pixel mismatch (compare-kit.ts). Data = the preview world
// (preview-world.ts, history level) written into the DB of a real server; transcripts = exactly `PV.transcripts` of
// data.js written as JSONL files (preview-transcripts.ts) in a temporary `CLAUDE_CONFIG_DIR` of the server → the text goes
// through the claude-jsonl adapter → API → UI. Browser + server clocks fixed at 14:00:42 like the preview.
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { liveDbUrl, ServerProcess } from '../support/server-process';
import { PREVIEW_NOW as NOW, previewDirs, runId, seedPreviewWorld } from '../support/preview-world';
import { previewTranscriptLength, writePreviewTranscript } from '../support/preview-transcripts';
import { vi } from '../../shared/i18n/vi';
import { PREVIEW_VIEW, regions, setLang, snap, tEn, writeReport, type RegionSpec } from './compare-kit';

test.use(PREVIEW_VIEW);

/** Like detail.visual.ts: the "errors 24h" cell of the top bar is masked (the preview contradicts itself — Q16); the list pane is cut at the bottom of the preview image. */
const topbar = (): RegionSpec => ({ name: 'top bar ("errors 24h" masked — Q16)', selector: 'header.topbar', mask: ['[data-testid=stat-errors-24h]'] });
const list = (): RegionSpec => ({ ...regions.list(), toPreviewBottom: true });
const all = (): RegionSpec[] => [topbar(), list(), regions.main()];
const PREVIEW_APP = pathToFileURL(fileURLToPath(new URL('../../design/preview/app.html', import.meta.url))).href;

/** Scroll positions of the panels (Transcript, Log) match the preview — see `matchPreviewScroll` in detail.visual.ts. */
async function matchPreviewScroll(page: Page, id: string) {
  const pv = await page.context().newPage();
  await pv.goto(`${PREVIEW_APP}?state=${id}&theme=light`);
  await pv.evaluate(() => document.fonts.ready);
  const tops = await pv.locator('.log-scroll').evaluateAll((els) => els.map((e) => e.scrollTop));
  await pv.close();
  await page.locator('.pane-main .log-scroll').evaluateAll((els, t) => els.forEach((e, i) => (e.scrollTop = t[i] ?? e.scrollTop)), tops);
}

test.describe('Transcript panel against the preview', () => {
  test.describe.configure({ mode: 'serial' });
  let sp: ServerProcess;
  let db: pg.Pool;
  const projects = join(realpathSync(mkdtempSync(join(tmpdir(), 'lc-tx-visual-'))), 'projects');
  test.beforeAll(async () => {
    sp = await ServerProcess.launch({ env: { CLAUDE_CONFIG_DIR: join(projects, '..') } });
    db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
  });
  test.afterAll(async () => {
    await db?.end();
    await sp?.stop();
    writeReport('transcript');
  });

  async function world(page: Page) {
    expect((await sp.api('POST', '/api/__test/reset')).status).toBe(204);
    expect((await sp.api('POST', '/api/__test/clock', { at: NOW.toISOString() })).status).toBe(200);
    expect((await sp.api('POST', '/api/__test/dirs', { paths: previewDirs() })).status).toBe(204);
    await seedPreviewWorld(db, { history: true });
    await page.clock.setFixedTime(NOW);
  }
  async function open(page: Page, path: string) {
    await page.goto(`${sp.baseUrl}${path}`);
    await expect(page.getByTestId('lamp-db')).toHaveAttribute('data-state', 'ok');
  }
  async function shot(page: Page, id: string, title: string, specs: RegionSpec[] = all()) {
    await matchPreviewScroll(page, id);
    await snap(page, id, title, specs);
  }
  const rows = (page: Page) => page.getByTestId('run-transcript').locator('[data-cursor]');
  const note = (page: Page) => page.getByTestId('run-transcript-note');

  test('running (no file yet → file → lost connection), ended (last page, top), not found, no session, Vietnamese UI', async ({ page }) => {
    test.setTimeout(240_000);
    await world(page);
    writePreviewTranscript(projects, 'debt104');
    writePreviewTranscript(projects, 'pilot63');

    // Run #69 in progress, Claude has not written the file yet → the "waiting" note (no pilot69 file yet).
    await open(page, `/runs/${runId('pilot', 69, '14:00:00')}`);
    await expect(note(page)).toHaveAttribute('data-mode', 'waiting');
    await expect(page.getByTestId('run-log').locator('[data-seq="1"]')).toBeVisible();
    await shot(page, 'run-transcript-waiting', 'Running, Claude has not written the transcript file yet');

    // The file appears → the panel shows up by itself (the server looks again every 500 ms) — no F5.
    writePreviewTranscript(projects, 'pilot69');
    await expect(rows(page)).toHaveCount(previewTranscriptLength('pilot69'), { timeout: 10_000 });
    await shot(page, 'run-transcript-running', 'Running: live transcript sticks to the bottom, empty thinking, tool call by field, long result folded');

    // Lost connection: red banner, Transcript + Log panels dimmed, "paused — waiting to reconnect".
    await sp.kill();
    try {
      await expect(page.getByTestId('run-transcript')).toHaveAttribute('data-paused', 'true', { timeout: 10_000 });
      await expect(page.getByTestId('run-log')).toHaveAttribute('data-paused', 'true', { timeout: 10_000 });
      await shot(page, 'run-transcript-paused', 'Lost connection while watching a running run: Transcript + Log dimmed');
    } finally {
      await sp.start();
    }
    // Once the server is back, the running run becomes Interrupted and the execution closes (server_down) → rebuild the world for the next states.
    await world(page);

    // Run 104 has ended (52 entries > a page of 50) — the panel scrolled to the top, the older-page request held → "loading older…".
    await page.route('**/transcript?before=*', () => undefined); // never answers
    await open(page, `/runs/${runId('debt', 104, '13:50:00')}`);
    await expect(rows(page)).toHaveCount(50);
    await expect(page.getByTestId('run-transcript-edge')).toHaveText(tEn('tx.loadingOlder'));
    await shot(page, 'run-transcript-ended', 'Ended: last page of 50 entries, scrolled to the top → loading older…');
    await page.unroute('**/transcript?before=*');

    // Run #68 has ended, no file for its session → the "not found" note.
    await open(page, `/runs/${runId('pilot', 68, '13:30:00')}`);
    await expect(note(page)).toHaveAttribute('data-mode', 'missing');
    await expect(page.getByTestId('run-log').locator('[data-seq="2"]')).toBeVisible();
    await shot(page, 'run-transcript-missing', 'Ended, the transcript file of the session was not found');

    // Skipped run → "no session".
    await open(page, `/runs/${runId('debt', null, '14:00:00')}`);
    await expect(note(page)).toHaveAttribute('data-mode', 'noSession');
    await shot(page, 'run-transcript-no-session', 'Skipped run — no session, so no transcript');

    // Run #63 (the agent skipped on its own), the whole file, Vietnamese UI.
    await open(page, `/runs/${runId('pilot', 63, '11:00:00')}`);
    await setLang(page, 'vi');
    await expect(rows(page)).toHaveCount(previewTranscriptLength('pilot63'));
    await expect(page.getByTestId('run-transcript-edge')).toHaveText(vi['tx.start']);
    await page.mouse.move(0, 0);
    await shot(page, 'vi-run-transcript', 'Run ended, the whole file — Vietnamese UI');
    await setLang(page, 'en');
  });
});
