import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RUNS_SQL,
  allLines,
  gapMinutes,
  idleDays,
  idleRuns,
  lateTasks,
  limitFailures,
  metricLine,
  ownerMessagesPerPr,
} from '../../scripts/metrics/baseline.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const script = fileURLToPath(new URL('../../scripts/metrics/baseline.mjs', import.meta.url));
const baseline = JSON.parse(readFileSync(new URL('../../scripts/metrics/baseline.json', import.meta.url), 'utf8')) as {
  window: { rows: number; until: string };
  metrics: Record<string, { value: string; unit: string; source: string }>;
};

const at = (min: number) => new Date(Date.UTC(2026, 9, 20, 0, min));
const row = (loop: string, start: number, end: number | null, status = 'succeeded', error: string | null = null) => ({
  loop_id: loop,
  status,
  started_at: at(start),
  finished_at: end === null ? null : at(end),
  error,
  session_id: null,
});

const jsonl = (...uses: Array<{ name: string; input: Record<string, unknown> }>) =>
  uses
    .map((u) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: u.name, input: u.input }] } }))
    .join('\n');

describe('metrics baseline', () => {
  it('gap is the median wait between a finish and the next start of the same loop', () => {
    // loop a: waits 15 and 29. loop b: wait 10. A skipped row is out. The median of 10, 15, 29 is 15.
    const rows = [
      row('a', 0, 5),
      row('a', 20, 25),
      row('a', 54, 60),
      row('b', 0, 10),
      row('b', 20, 30),
      row('a', 30, 31, 'skipped'),
    ];
    expect(gapMinutes(rows)).toBe(15);
    expect(metricLine('gap', gapMinutes(rows))).toBe('gap 15.0 min runs');
  });

  it('limit-failures counts the failed rows whose error starts with the plan limit text', () => {
    const rows = [
      row('a', 0, 1, 'failed', "You've hit your limit"),
      row('a', 2, 3, 'failed', 'You’ve hit your weekly limit'),
      row('a', 4, 5, 'failed', 'spawn error: You\'ve hit your limit'),
      row('a', 6, 7, 'failed', 'boom'),
      row('a', 8, 9, 'succeeded', "You've hit your limit"),
    ];
    expect(limitFailures(rows)).toBe(2);
    expect(metricLine('limit-failures', 2)).toBe('limit-failures 2 runs runs');
  });

  it('idle-days rounds the days between now and the latest start', () => {
    const rows = [row('a', 0, 1)].map((r) => ({ ...r, started_at: new Date('2026-10-22T15:15:00Z') }));
    expect(idleDays(rows, new Date('2026-11-01T15:15:00Z'))).toBe(10);
    // A second clock, so that a constant 10 fails.
    expect(idleDays(rows, new Date('2026-10-25T15:15:00Z'))).toBe(3);
  });

  it('idle-runs counts the sessions with no edit, no write and no push or pull request', () => {
    const readOnly = jsonl({ name: 'Read', input: { file_path: 'a.ts' } }, { name: 'Bash', input: { command: 'git status' } });
    const edit = jsonl({ name: 'Edit', input: { file_path: 'a.ts' } });
    const pr = jsonl({ name: 'Bash', input: { command: 'gh pr create --title x' } });
    expect(idleRuns([readOnly, edit, pr])).toBe(1);
  });

  it('late-tasks is the share created in the last 10 hours', () => {
    const hours = [0, 1, 2, 3, 4, 5, 20, 21, 22, 30]; // hours after the first creation
    const created = hours.map((h) => new Date(Date.UTC(2026, 9, 21, 0) + h * 3_600_000).toISOString());
    // The latest is at 30 h. The window starts at 20 h. Four of ten (20, 21, 22, 30) fall in it.
    expect(lateTasks(created)).toBe(40);
    expect(metricLine('late-tasks', lateTasks(created))).toBe('late-tasks 40.0 percent github');
  });

  it('owner-messages divides typed messages by merged PRs', () => {
    const typed = Array.from({ length: 21 }, () => ({ type: 'user', message: { role: 'user', content: 'hello' } }));
    const results = Array.from({ length: 9 }, () => ({
      type: 'user',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] },
    }));
    expect(ownerMessagesPerPr([...typed, ...results], 25)).toBe(0.84);
  });

  it('unknown metric exits 2 and prints nothing on stdout', () => {
    const r = spawnSync(process.execPath, [script, '--metric', 'no-such-metric'], { cwd: root, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
  });

  it('no output holds a loop name, a prompt or a summary', () => {
    const secret = 'Secret-Loop-Name-42';
    const rows = [{ ...row('a', 0, 5), name: secret, prompt_snapshot: secret, summary: secret }];
    const out = allLines({ rows, now: new Date('2026-11-01T15:15:00Z'), idle: 3, late: 50 }).join('\n');
    expect(out).not.toContain(secret);
    expect(RUNS_SQL.toLowerCase()).not.toMatch(/name|prompt|summary/);
    expect(RUNS_SQL.toLowerCase()).toMatch(/^\s*select\b/);
  });

  it('baseline.json holds the recorded values', () => {
    const recorded = Object.fromEntries(Object.entries(baseline.metrics).filter(([, m]) => m.source === 'recorded'));
    const values = Object.fromEntries(Object.entries(recorded).map(([k, m]) => [k, m.value]));
    expect(values).toEqual({
      'owner-stops': '6',
      'dead-claims': '253',
      'merged-on-red': '12',
      'stub-share': '0',
      'poll-share': '37',
      'first-goal-day': '3',
      'status-questions': '7',
      'owner-messages': '0.84,1.77',
      'causes-found': '0',
      'cause-repeats': '11',
      'blocked-runs': '12',
    });
  });

  it('baseline.json holds the live values of the window', () => {
    const m = baseline.metrics as Record<string, { value: string }>;
    expect(baseline.window.rows).toBe(227);
    expect(baseline.window.until).toBe('2026-10-23T00:00:00Z');
    expect(Object.keys(m)).toHaveLength(16);
    expect(m['limit-failures']!.value).toBe('12');
    expect(m['idle-days']!.value).toBe('10');
    expect(Number(m.gap!.value)).toBeGreaterThanOrEqual(14.0);
    expect(Number(m.gap!.value)).toBeLessThanOrEqual(15.0);
    expect(Number(m['idle-runs']!.value)).toBeGreaterThanOrEqual(100);
    expect(Number(m['idle-runs']!.value)).toBeLessThanOrEqual(130);
  });
});
