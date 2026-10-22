/// <reference lib="dom" />
// E2E UC-22: a REAL Claude run from the UI - register a repo, create a Claude loop (haiku / effort low, a tiny prompt),
// Start, wait for the run to finish; run screen: session id = SELECT = the name of the file `<id>.jsonl` under ~/.claude/projects/ (Claude Code saved the
// session -> `claude --resume <id>` in the repo folder reopens exactly it), cost, summary, the copy-resume-command button (no
// `cd` - D-UI12). Costs one small run of the subscription (a few cents at the SDK's estimated price); needs `claude` logged in on the machine.
// Test mode only opens real Claude in a folder named `lc-real-claude-*` (test-mode-query.ts) - the test creates exactly such a folder.
// UC-30: the same way, but the prompt makes the agent run a background command then end the turn to wait - the run must wait for Claude Code to wake
// the agent up, the summary is the text AFTER the wake-up, and the process exits gracefully (the last transcript line is `cost-state`).
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { formatUsd } from '../../shared/domain/cost';
import { api, closeDb, db, fill, pickRepo } from '../support/form-kit';
import { CLAUDE_END_OK_PREFIX, claudeStartLog } from '../support/server-text';
import { t } from '../support/ui-text';
import { pickScheduleKind, registerRepo } from '../support/ui';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh', permissions: ['clipboard-read', 'clipboard-write'] });
test.afterAll(closeDb);

/** `~/.claude/projects/<folder of the cwd>/<session_id>.jsonl` - Claude Code stores the transcript by session id. */
function findSessionFile(sessionId: string): string | null {
  const root = join(homedir(), '.claude', 'projects');
  if (!existsSync(root)) return null;
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const f = join(root, dir.name, `${sessionId}.jsonl`);
    if (existsSync(f)) return f;
  }
  return null;
}

test('UC-22: a real Claude run - session id on screen = SELECT = the .jsonl file of Claude Code; cost, summary, copy claude --resume <id>', { tag: '@UC-22' }, async ({ page, request }) => {
  test.setTimeout(300_000);
  expect((await api(request, 'POST', '/api/__test/reset')).status).toBe(204);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lc-real-claude-')));

  // Register the repo on the Repos page.
  await page.goto('/repos');
  await registerRepo(page, dir);
  await expect(page.getByTestId('repo-row')).toHaveCount(1);

  // Create a Claude haiku / low loop on the form, yearly schedule (only the first run at Start runs).
  await page.goto('/loops/new');
  await fill(page, 'f-name', 'UC-22 real Claude');
  await fill(page, 'f-prompt', 'Create a file ok.txt in the current folder, content exactly two letters: ok. Do nothing else. When done, reply with exactly one word: done');
  await pickRepo(page, basename(dir));
  await page.getByTestId('f-model-haiku').click();
  await page.getByTestId('f-effort-low').click();
  await pickScheduleKind(page, 'advanced');
  await fill(page, 'sched-cron', '0 0 1 1 *');
  await page.getByTestId('form-submit').click();
  await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}$/);
  const loopId = page.url().split('/').pop()!;
  expect((await db().query('SELECT executor_kind, executor_config FROM loops WHERE id = $1', [loopId])).rows[0]).toEqual({
    executor_kind: 'claude',
    executor_config: { model: 'haiku', effort: 'low' },
  });

  // Start -> the first run starts at once; wait for it to finish (real Claude: a few tens of seconds).
  await page.getByTestId('loop-start').click();
  await expect
    .poll(async () => (await db().query('SELECT status FROM runs WHERE loop_id = $1', [loopId])).rows[0]?.status, { timeout: 240_000, intervals: [2_000] })
    .toBe('succeeded');
  const row = (await db().query('SELECT id, session_id, cost_usd, summary FROM runs WHERE loop_id = $1', [loopId])).rows[0] as {
    id: string; session_id: string; cost_usd: string; summary: string;
  };
  const run = { ...row, cost_usd: Number(row.cost_usd) }; // numeric column -> pg returns a string
  expect((await api(request, 'POST', `/api/loops/${loopId}/stop`)).status).toBe(200);

  // Claude ran in the repo folder (cwd), with bypassed permissions.
  expect(readFileSync(join(dir, 'ok.txt'), 'utf8').trim()).toBe('ok');
  expect(run.session_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(run.cost_usd).toBeGreaterThan(0);
  const file = findSessionFile(run.session_id);
  expect(file, `~/.claude/projects/*/${run.session_id}.jsonl`).not.toBeNull();

  // Run screen: session id = SELECT = the .jsonl file name; cost; summary; the console log; the resume command.
  await page.goto(`/runs/${run.id}`);
  await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'succeeded');
  await expect(page.getByTestId('run-session')).toHaveAttribute('data-session-id', run.session_id);
  expect(basename(file!, '.jsonl')).toBe(await page.getByTestId('run-session').getAttribute('data-session-id'));
  await expect(page.getByTestId('run-cost')).toContainText(formatUsd(run.cost_usd));
  await expect(page.getByTestId('run-summary')).toHaveText(run.summary);
  await expect(page.getByTestId('run-log')).toContainText(claudeStartLog(1, run.session_id));
  await expect(page.getByTestId('run-log')).toContainText(`${CLAUDE_END_OK_PREFIX}$`);
  await expect(page.getByTestId('run-resume-cmd')).toHaveText(`claude --resume ${run.session_id}`);
  await page.getByTestId('run-resume-copy').click();
  await expect(page.locator('.toast')).toHaveText(t('toast.copiedResume', { id: run.session_id }));
  expect((await page.evaluate(() => navigator.clipboard.readText())).trim()).toBe(`claude --resume ${run.session_id}`);
  console.log(`[UC-22] session ${run.session_id} · cost $${run.cost_usd} · summary «${run.summary}» · ${file}`);
});

test('UC-30: a run waiting for a background task - the agent runs a background command then ends the turn; the run keeps going until Claude Code wakes the agent; the summary is the text after that; the process exits gracefully', { tag: '@UC-30' }, async ({ page, request }) => {
  test.setTimeout(300_000);
  expect((await api(request, 'POST', '/api/__test/reset')).status).toBe(204);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lc-real-claude-')));
  const token = `LC${randomBytes(4).toString('hex').toUpperCase()}`;

  // Register the repo, create a Claude haiku / low loop on the form, yearly schedule (only the first run at Start runs).
  await page.goto('/repos');
  await registerRepo(page, dir);
  await expect(page.getByTestId('repo-row')).toHaveCount(1);
  await page.goto('/loops/new');
  await fill(page, 'f-name', 'UC-30 wait for background task');
  await fill(
    page,
    'f-prompt',
    `Your very first action must be a call to the Bash tool with run_in_background=true running exactly one command: sleep 20 && echo ${token}\n` +
      'Write no text before that tool call; replying without making it is a failure.\n' +
      'Once the tool call has returned (the command is only started), end the turn at once, replying with exactly two words: STILL WAITING\n' +
      'Later, when Claude Code reports the background command is done, read its output and reply with exactly one line: ALL DONE <output>',
  );
  await pickRepo(page, basename(dir));
  await page.getByTestId('f-model-haiku').click();
  await page.getByTestId('f-effort-low').click();
  await pickScheduleKind(page, 'advanced');
  await fill(page, 'sched-cron', '0 0 1 1 *');
  await page.getByTestId('form-submit').click();
  await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}$/);
  const loopId = page.url().split('/').pop()!;

  // Start -> the first run starts at once. The old executor treated the first result ("STILL WAITING", ~10 seconds) as the end of the run; the right version waits until the agent is woken up.
  await page.getByTestId('loop-start').click();
  const statusOf = async () => (await db().query('SELECT status FROM runs WHERE loop_id = $1', [loopId])).rows[0]?.status ?? 'no run yet';
  await expect
    .poll(statusOf, { timeout: 240_000, intervals: [2_000] })
    .toMatch(/^(succeeded|failed|cancelled|timed_out|interrupted|skipped)$/);
  const row = (await db().query('SELECT id, status, error, session_id, cost_usd, summary, started_at, finished_at FROM runs WHERE loop_id = $1', [loopId])).rows[0] as {
    id: string; status: string; error: string | null; session_id: string; cost_usd: string; summary: string; started_at: Date; finished_at: Date;
  };
  expect((await api(request, 'POST', `/api/loops/${loopId}/stop`)).status).toBe(200);
  expect({ status: row.status, error: row.error }).toEqual({ status: 'succeeded', error: null });

  // The summary is the text AFTER the wake-up; the run lasts long enough for the background command (sleep 20) to finish; the cost is that of the last result.
  expect(row.summary).toContain('ALL DONE');
  expect(row.summary).toContain(token);
  const ms = row.finished_at.getTime() - row.started_at.getTime();
  expect(ms, 'the run waited until the background command finished').toBeGreaterThanOrEqual(20_000);
  expect(Number(row.cost_usd)).toBeGreaterThan(0);

  // The console log: exactly the two D-UI18 lines, no extra "waiting" line (project owner: "Do not add").
  const logs = (await db().query('SELECT message FROM run_logs WHERE run_id = $1 ORDER BY seq', [row.id])).rows.map((r) => r.message as string);
  expect(logs).toEqual([claudeStartLog(1, row.session_id), expect.stringMatching(new RegExp(`^${CLAUDE_END_OK_PREFIX}[$]\\d`))]);

  // The Claude Code process exits gracefully: the last transcript line is `cost-state` (a run closed midway - #11, #37 - has no such line).
  const file = findSessionFile(row.session_id);
  expect(file, `~/.claude/projects/*/${row.session_id}.jsonl`).not.toBeNull();
  const lines = readFileSync(file!, 'utf8').split('\n').filter((l) => l.trim() !== '');
  expect((JSON.parse(lines.at(-1)!) as { type: string }).type).toBe('cost-state');

  // Run screen: Succeeded, summary = DB, exactly two log lines.
  await page.goto(`/runs/${row.id}`);
  await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'succeeded');
  await expect(page.getByTestId('run-summary')).toHaveText(row.summary);
  await expect(page.getByTestId('run-log').locator('[data-seq]')).toHaveCount(2);
  await expect(page.getByTestId('run-log')).toContainText(claudeStartLog(1, row.session_id));
  await expect(page.getByTestId('run-log')).toContainText(`${CLAUDE_END_OK_PREFIX}$`);
  console.log(`[UC-30] session ${row.session_id} · ${(ms / 1000).toFixed(1)} s · cost $${Number(row.cost_usd)} · summary «${row.summary}» · ${file}`);
});
