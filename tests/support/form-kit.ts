/// <reference lib="dom" />
// Shared tools of the form e2e tests (tests/e2e/form.spec.ts) and the form shots (tests/visual/form.visual.ts): call the
// API of the Playwright server (test mode), read Postgres directly, fill the form like a user. The sample data comes from
// design/preview/data.js (SAMPLE_NEW = the "Scan API logs for crashes" loop, PILOT = the "Issue backlog worker" loop),
// as preview.js uses it, so the app shots match the preview shots.
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';
import { databaseUrl, loadDotEnv } from '../../server/config';
import { previewData } from './preview-world';
import { ensureTestRepo } from './test-repo';

loadDotEnv();

/** "Now" of the preview: Sunday 18/10/2026 14:00:42 (Asia/Ho_Chi_Minh). */
export const PREVIEW_NOW = new Date('2026-10-18T14:00:42+07:00');
export const at = (hms: string) => new Date(`2026-10-18T${hms}+07:00`);

const CRASH = previewData().loops.crash;
/** The new-loop sample of the preview form (SAMPLE_NEW of preview.js = the "Scan API logs for crashes" loop). */
export const SAMPLE_NEW: { name: string; desc: string; prompt: string } = { name: CRASH.name, desc: CRASH.desc, prompt: CRASH.prompt };

const P = previewData().loops.pilot;
/** The "Issue backlog worker" loop of the preview (Claude opus / high, no timeout). */
export const PILOT: {
  name: string;
  description: string;
  prompt: string;
  cron: string;
  timezone: string;
  timeoutSec: number | null;
  executor: { kind: string; config: { model: string; effort: string } };
} = {
  name: P.name,
  description: P.desc,
  prompt: P.prompt,
  cron: P.cron,
  timezone: P.tz,
  timeoutSec: P.timeout,
  executor: { kind: 'claude', config: { model: P.claude.model, effort: P.claude.effort } },
};

/** Long-running Mock executor (test mode only): the run stays `running` until the test presses Stop. */
export const MOCK_LONG = { kind: 'mock', config: { durationSec: 600, failRate: 0 } };

export type LoopRow = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  cron: string;
  timezone: string;
  timeout_sec: number | null;
  repo_id: string;
  executor_kind: string;
  executor_config: { durationSec?: number; failRate?: number; model?: string; effort?: string };
  status: string;
  version: number;
  next_run_at: Date | null;
  archived_at: Date | null;
};

let pool: pg.Pool | null = null;
export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: databaseUrl(process.env, 'test'), max: 2 });
  return pool;
}
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
}
export async function loopRows(): Promise<LoopRow[]> {
  return (await db().query<LoopRow>('SELECT * FROM loops ORDER BY created_at, name')).rows;
}
export async function loopRow(id: string): Promise<LoopRow> {
  const r = (await db().query<LoopRow>('SELECT * FROM loops WHERE id = $1', [id])).rows[0];
  if (!r) throw new Error(`no loop ${id} in the DB`);
  return r;
}

export async function api<T = unknown>(request: APIRequestContext, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await request.fetch(path, { method, ...(body === undefined ? {} : { data: body }) });
  const text = await res.text();
  return { status: res.status(), body: (text ? JSON.parse(text) : null) as T };
}

/** Empties the DB, then registers the test repo again (a temporary folder of the machine) through the API. */
export async function reset(request: APIRequestContext): Promise<void> {
  expect((await api(request, 'POST', '/api/__test/reset')).status).toBe(204);
  await ensureTestRepo((m, u, b) => api(request, m, u, b));
}

export type LoopJson = { id: string; repo: { id: string; name: string; path: string }; name: string; version: number; status: string; updatedAt: string; cron: string; prompt: string; description: string; timeoutSec: number | null; executor: { kind: string; config: Record<string, unknown> } };

export async function createLoop(request: APIRequestContext, body: Record<string, unknown>): Promise<LoopJson> {
  // The test repo + the long-running Mock executor unless the test says otherwise (the real console defaults to Claude —
  // tests never start a real Claude).
  const repoId = body.repoId ? undefined : await ensureTestRepo((m, u, b) => api(request, m, u, b));
  const r = await api<LoopJson>(request, 'POST', '/api/loops', { ...(repoId ? { repoId } : {}), timeoutSec: 1800, executor: MOCK_LONG, ...body });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}

/** Takes the caret out of the field being typed in (the focus ring is not in the preview shots). */
export async function blur(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Retypes the whole field (clears the old text). */
export async function fill(page: Page, testId: string, value: string): Promise<void> {
  await page.getByTestId(testId).fill(value);
}

export async function fillInfo(page: Page, v: { name: string; desc: string; prompt: string }): Promise<void> {
  await fill(page, 'f-name', v.name);
  await fill(page, 'f-description', v.desc);
  await fill(page, 'f-prompt', v.prompt);
}

/** Turns on / off exactly the weekdays `days` on the Mon…Sun chips. */
export async function pickDays(page: Page, days: number[]): Promise<void> {
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const chip = page.getByTestId(`sched-day-${d}`);
    const on = (await chip.getAttribute('aria-checked')) === 'true';
    if (on !== days.includes(d)) await chip.click();
  }
}

/** Picks a repo in the Repo field of the form (combobox — D-UI13) by the name shown in the list. */
export async function pickRepo(page: Page, name: string): Promise<void> {
  await page.getByTestId('f-repo').click();
  await page.getByTestId(/^repo-opt-/).filter({ has: page.getByTestId('repo-opt-name').filter({ hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`) }) }).click();
}
