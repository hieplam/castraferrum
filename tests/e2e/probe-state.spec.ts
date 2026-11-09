// E2E UC-38 (goal G28), the loop page of a loop with a probe on the real build: a fake probe (tests/support/fake-probe.mjs) prints the line that a
// file holds, the console calls it (the test clock winds on 61 s for a second call), and the page says what the line says: its own word for each
// action, the list of its state, and the last probe line. All real: browser, build, Fastify, Postgres (test mode); no model, no GitHub.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { api, createLoop, reset } from '../support/form-kit';

const FAKE_PROBE = resolve('tests/support/fake-probe.mjs');
test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A loop with a probe that prints `file`, started, until the console has called the probe once (its state is no longer `active`). */
async function startedProbeLoop(request: APIRequestContext, line: string | null) {
  await reset(request);
  const dir = mkdtempSync(join(tmpdir(), 'lc-probe-state-'));
  const file = join(dir, 'line.txt');
  if (line !== null) writeFileSync(file, `${line}\n`);
  const loop = await createLoop(request, { name: `probe ${dir.slice(-6)}`, description: 'A probe picks the next task', prompt: 'Do the claimed task', cron: '0 0 1 1 *' });
  const saved = await api(request, 'PUT', `/api/loops/${loop.id}/probe`, { command: [process.execPath, FAKE_PROBE, file] });
  expect(saved.status).toBe(200);
  expect((await api(request, 'POST', `/api/loops/${loop.id}/start`)).status).toBe(200);
  await expect.poll(async () => ((await api<Json>(request, 'GET', `/api/loops/${loop.id}/probe`)).body.probe as Json).state, { timeout: 20_000 }).not.toBe('active');
  return { loop, file, dir };
}

const wait = { v: 1, action: 'wait', reason: 'Task 18 needs the staging login.' };

test('UC-38: action wait shows Waiting for you, the reason and the last probe line', { tag: '@UC-38' }, async ({ page, request }) => {
  const { loop } = await startedProbeLoop(request, JSON.stringify(wait));
  await page.goto(`/loops/${loop.id}`);
  await expect(page.getByTestId('loop-status')).toHaveText('Waiting for you');
  await expect(page.getByTestId('now-card')).toHaveAttribute('data-state', 'waiting');
  await expect(page.getByTestId('now-card')).toContainText('Task 18 needs the staging login.');
  await expect(page.getByTestId('probe-line')).toContainText('"action":"wait"');
  await expect(page.getByTestId('loop-stop')).toBeVisible();
});

test('UC-38: action blocked with blockers shows each issue with its title, the tasks it blocks and its link', { tag: '@UC-38' }, async ({ page, request }) => {
  const blocked = {
    v: 1,
    action: 'blocked',
    reason: 'Every open task waits for a failed task.',
    issues: ['31', '33'],
    blockers: [
      { key: '31', title: 'Migration 14 fails', blocks: 3, url: 'https://github.com/hieplam/tribe/issues/31' },
      { key: '33', title: 'The check on main is red', blocks: 1, url: 'https://github.com/hieplam/tribe/issues/33' },
    ],
  };
  const { loop } = await startedProbeLoop(request, JSON.stringify(blocked));
  await page.goto(`/loops/${loop.id}`);
  await expect(page.getByTestId('loop-status')).toHaveText('Blocked');
  const rows = page.getByTestId('blocker-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Issue 31: Migration 14 fails');
  await expect(rows.first()).toContainText('Blocks 3 tasks');
  await expect(rows.last()).toContainText('Blocks 1 task');
  await expect(rows.first()).toHaveAttribute('href', 'https://github.com/hieplam/tribe/issues/31');
  await expect(rows.first()).toHaveAttribute('rel', 'noopener');
  // The cells above show the blockers, so the line under them does not repeat them.
  await expect(page.getByTestId('probe-line')).toContainText('"issues":["31","33"]');
  await expect(page.getByTestId('probe-line')).not.toContainText('blockers');
});

test('UC-38: action blocked with only issue keys shows a plain cell for each, with no link', { tag: '@UC-38' }, async ({ page, request }) => {
  const { loop } = await startedProbeLoop(request, JSON.stringify({ v: 1, action: 'blocked', reason: 'A failed task blocks the rest.', issues: ['31'] }));
  await page.goto(`/loops/${loop.id}`);
  await expect(page.getByTestId('loop-status')).toHaveText('Blocked');
  await expect(page.getByTestId('blocker-row')).toHaveCount(1);
  await expect(page.getByTestId('blocker-row')).toHaveText('Issue 31');
  await expect(page.locator('a[data-testid="blocker-row"]')).toHaveCount(0);
  await expect(page.getByTestId('blocker-list').locator('svg')).toHaveCount(0);
});

test('UC-38: action hold shows Held, the hold banner and the open hold', { tag: '@UC-38' }, async ({ page, request }) => {
  const until = new Date(Date.now() + 2 * 3_600_000).toISOString();
  const hold = { v: 1, action: 'hold', resource: 'plan-window', reason: 'The usage limit is reached.', until };
  const { loop } = await startedProbeLoop(request, JSON.stringify(hold));
  await page.goto(`/loops/${loop.id}`);
  await expect(page.getByTestId('loop-status')).toHaveText('Held');
  await expect(page.getByTestId('banner-hold')).toContainText('The usage limit is reached.');
  await expect(page.getByTestId('hold-list')).toContainText('plan-window');
  await expect(page.getByTestId('now-card')).toContainText('Held on plan-window');
});

test('UC-38: action done shows Goal met, the closed active period and Start', { tag: '@UC-38' }, async ({ page, request }) => {
  const { loop } = await startedProbeLoop(request, JSON.stringify({ v: 1, action: 'done', goals: { passed: 8, total: 8 } }));
  await page.goto(`/loops/${loop.id}`);
  await expect(page.getByTestId('loop-status')).toHaveText('Goal met');
  await expect(page.getByTestId('period-status')).toHaveText('Goal met');
  await expect(page.getByTestId('fig-goals')).toContainText('8/8');
  await expect(page.getByTestId('loop-start')).toBeVisible();
});

test('UC-38: a probe that stops answering shows Probe failed after the next call', { tag: '@UC-38' }, async ({ page, request }) => {
  const { loop, file, dir } = await startedProbeLoop(request, JSON.stringify(wait));
  rmSync(file); // the fake probe now exits 1
  expect((await api(request, 'POST', '/api/__test/clock', { advanceMs: 61_000 })).status).toBe(200);
  await expect.poll(async () => ((await api<Json>(request, 'GET', `/api/loops/${loop.id}/probe`)).body.probe as Json).state, { timeout: 20_000 }).toBe('probe_failed');
  await page.goto(`/loops/${loop.id}`);
  await expect(page.getByTestId('loop-status')).toHaveText('Probe failed');
  await expect(page.getByTestId('now-card')).toHaveAttribute('data-state', 'probe_failed');
  rmSync(dir, { recursive: true, force: true });
});

test('UC-38: opening the loop page marks the notice of the loop read', { tag: '@UC-38' }, async ({ page, request }) => {
  const { loop } = await startedProbeLoop(request, JSON.stringify(wait));
  const unread = async () => ((await api<{ items: unknown[] }>(request, 'GET', '/api/notices')).body.items ?? []).length;
  expect(await unread()).toBe(1);
  await page.goto(`/loops/${loop.id}`);
  await expect(page.getByTestId('loop-status')).toHaveText('Waiting for you');
  await expect.poll(unread, { timeout: 15_000 }).toBe(0);
});
