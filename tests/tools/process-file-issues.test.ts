// Oracle of scripts/process-file-issues.mjs and scripts/process-review-due.mjs (R3, goal G14).
// Every test runs the scripts as child processes against the fake gh (F2): no network, no real repository.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeGh, type FakeGh, type FakeIssue } from '../support/fake-gh-kit.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fileIssues = join(root, 'scripts', 'process-file-issues.mjs');
const reviewDue = join(root, 'scripts', 'process-review-due.mjs');
const fixture = (name: string) => join(root, 'tests', 'tools', 'fixtures', 'process-review', `${name}.json`);

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function setup(): { gh: FakeGh; file: (...args: string[]) => { code: number | null; out: string; err: string } } {
  const gh = createFakeGh();
  cleanups.push(() => gh.dispose());
  const file = (...args: string[]) => {
    const r = spawnSync(process.execPath, [fileIssues, ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, LOOPS_GH_BIN: gh.script, FAKE_GH_WORLD: gh.world },
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  return { gh, file };
}

function seedIssue(gh: FakeGh, patch: Partial<FakeIssue>): void {
  const w = gh.read();
  w.issues.push({
    number: 7,
    title: 'process-review: old',
    body: '<!-- fingerprint:aaaaaaaaaaaa -->',
    state: 'OPEN',
    labels: [],
    comments: [],
    url: 'https://github.com/hieplam/tribe/issues/7',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    closedAt: null,
    ...patch,
  });
  writeFileSync(gh.world, JSON.stringify(w));
}

const writeCalls = (gh: FakeGh) =>
  gh.read().calls.filter((c) => c.args[0] === 'issue' && ['create', 'comment', 'reopen'].includes(c.args[1] ?? ''));

describe('process-file-issues', () => {
  it('prints usage and exits 2 when no file is given', () => {
    const { gh, file } = setup();
    const r = file();
    expect(r.code).toBe(2);
    expect(r.err).toContain('usage: process-file-issues.mjs <file> [--dry-run]');
    expect(gh.read().calls).toEqual([]);
  });

  it('exits 2 and writes nothing when a cluster has no valid fingerprint', () => {
    const { gh, file } = setup();
    const r = file(fixture('no-fingerprint'));
    expect(r.code).toBe(2);
    expect(r.err).toContain('fingerprint');
    expect(gh.read().calls).toEqual([]);
  });

  it('checks every cluster first: a bad cluster at the end of the file writes nothing at all', () => {
    const { gh, file } = setup();
    const r = file(fixture('bad-last-cluster'));
    expect(r.code).toBe(2);
    expect(r.err).toContain('cluster 3');
    expect(gh.read().calls).toEqual([]);
    expect(gh.read().issues).toEqual([]);
  });

  it('3 events create one issue with the fingerprint marker and the check', () => {
    const { gh, file } = setup();
    const r = file(fixture('three-events'));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ created: ['aaaaaaaaaaaa'], updated: [], skipped: [] });
    const issues = gh.read().issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]!.title).toBe('process-review: cause of usage-limit');
    expect(issues[0]!.body).toContain('<!-- fingerprint:aaaaaaaaaaaa -->');
    expect(issues[0]!.body).toContain('Events: 3');
    expect(issues[0]!.body).toContain('2026-10-19T08:00:00.000Z to 2026-10-22T09:30:00.000Z');
    expect(issues[0]!.body).toContain('hook');
    expect(issues[0]!.body).toContain('hooks/usage-limit.mjs');
    expect(issues[0]!.body).toContain('node hooks/usage-limit.mjs --replay');
  });

  it('1 event opens no issue and is skipped', () => {
    const { gh, file } = setup();
    const r = file(fixture('one-event'));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ created: [], updated: [], skipped: ['cccccccccccc'] });
    expect(gh.read().issues).toEqual([]);
    expect(writeCalls(gh)).toEqual([]);
  });

  it('2 events open one issue', () => {
    const { gh, file } = setup();
    const r = file(fixture('two-events'));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).created).toEqual(['aaaaaaaaaaaa']);
    expect(gh.read().issues).toHaveLength(1);
  });

  it('two clusters open two issues', () => {
    const { gh, file } = setup();
    const r = file(fixture('two-clusters'));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).created).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    const issues = gh.read().issues;
    expect(issues.map((i) => i.title)).toEqual(['process-review: cause of usage-limit', 'process-review: cause of smart-app-control']);
  });

  it('a repeat on an open issue adds a comment and opens no second issue', () => {
    const { gh, file } = setup();
    expect(file(fixture('three-events')).code).toBe(0);
    const r = file(fixture('three-events'));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ created: [], updated: ['aaaaaaaaaaaa'], skipped: [] });
    const issues = gh.read().issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]!.comments).toHaveLength(1);
    expect(issues[0]!.comments[0]!.body).toContain('3 events');
    expect(issues[0]!.comments[0]!.body).toContain('2026-10-22T09:30:00.000Z');
  });

  it('a repeat on a closed issue reopens it, then comments', () => {
    const { gh, file } = setup();
    seedIssue(gh, { state: 'CLOSED', closedAt: '2026-10-10T00:00:00.000Z' });
    const r = file(fixture('three-events'));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).updated).toEqual(['aaaaaaaaaaaa']);
    const w = gh.read();
    expect(w.issues).toHaveLength(1);
    expect(w.issues[0]!.state).toBe('OPEN');
    expect(w.issues[0]!.comments).toHaveLength(1);
    expect(writeCalls(gh).map((c) => c.args[1])).toEqual(['reopen', 'comment']);
  });

  it('--dry-run reports what it would do and writes nothing', () => {
    const { gh, file } = setup();
    const r = file(fixture('two-clusters'), '--dry-run');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).created).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb']);
    expect(gh.read().issues).toEqual([]);
    expect(writeCalls(gh)).toEqual([]);
  });
});

describe('process-review-due', () => {
  function due(dir: string, ...args: string[]) {
    const r = spawnSync(process.execPath, [reviewDue, '--dir', dir, ...args], { cwd: root, encoding: 'utf8' });
    return { code: r.status, out: r.stdout, err: r.stderr };
  }
  function reportDir(...names: string[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'lc-review-due-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    for (const n of names) writeFileSync(join(dir, `${n}.json`), '{}');
    return dir;
  }

  it('is due when there is no report', () => {
    const r = due(reportDir(), '--now', '2026-10-27T00:00:00Z');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ due: true, reason: 'no report yet', last: null });
  });

  it('is not due when the newest report is 6 days old', () => {
    const r = due(reportDir('2026-10-01', '2026-10-20'), '--now', '2026-10-26T23:59:59Z');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ due: false, last: '2026-10-20' });
  });

  it('is due when the newest report is 7 days old', () => {
    const r = due(reportDir('2026-10-01', '2026-10-20'), '--now', '2026-10-27T00:00:00Z');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ due: true, last: '2026-10-20' });
  });

  it('--event makes a review due at once', () => {
    const r = due(reportDir('2026-10-20'), '--now', '2026-10-21T00:00:00Z', '--event', 'epic_closed');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ due: true, reason: 'event epic_closed', last: '2026-10-20' });
  });

  it('exits 2 on an unknown event', () => {
    const r = due(reportDir('2026-10-20'), '--now', '2026-10-21T00:00:00Z', '--event', 'moon_phase');
    expect(r.code).toBe(2);
    expect(r.err).toContain('moon_phase');
    expect(r.out).toBe('');
  });
});
