// Oracle of scripts/merge-audit.mjs (K9, goal G6). The script runs as a child process against the fake gh (F2):
// no network, no real repository. A merge that went around the gate must be found, and a failed `gh` call must
// never look like "all clear".
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeGh, type FakeGh, type FakePr } from '../support/fake-gh-kit.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const script = join(root, 'scripts', 'merge-audit.mjs');

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const sha = (n: number) => `${n.toString(16).padStart(2, '0')}abcdef1234567890abcdef1234567890abcdef`;

function setup(): { gh: FakeGh; audit: (...args: string[]) => { code: number | null; out: string; err: string } } {
  const gh = createFakeGh();
  cleanups.push(() => gh.dispose());
  const audit = (...args: string[]) => {
    const r = spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, LOOPS_GH_BIN: gh.script, FAKE_GH_WORLD: gh.world },
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  return { gh, audit };
}

function mergedPr(number: number, mergedAt: string, patch: Partial<FakePr> = {}): FakePr {
  return {
    number,
    title: `PR ${number}`,
    body: '',
    state: 'MERGED',
    headRefName: `b${number}`,
    baseRefName: 'main',
    headRefOid: sha(number),
    mergeCommit: null,
    url: `https://github.com/hieplam/tribe/pull/${number}`,
    createdAt: '2026-10-01T00:00:00.000Z',
    mergedAt,
    ...patch,
  };
}

/** Seed merged PRs; `status` maps a PR number to the state of its gate status (absent: no status). */
function seed(gh: FakeGh, prs: FakePr[], status: Record<number, string>, description: Record<number, string> = {}): void {
  const w = gh.read();
  w.prs.push(...prs);
  for (const [n, state] of Object.entries(status)) {
    w.statuses[sha(Number(n))] = [
      { state, context: 'castraferrum/gate', description: description[Number(n)] ?? 'verify: ok', created_at: '2026-11-01T00:00:00.000Z' },
    ];
  }
  writeFileSync(gh.world, JSON.stringify(w));
}

const SINCE = '2026-11-01T00:00:00Z';
const AFTER = '2026-11-02T00:00:00.000Z';

describe('merge-audit', () => {
  it('reports no incident when every merged PR has a success gate status', () => {
    const { gh, audit } = setup();
    seed(gh, [mergedPr(1, AFTER), mergedPr(2, AFTER)], { 1: 'success', 2: 'success' });
    const r = audit('-R', 'hieplam/tribe', '--since', SINCE);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('merge-audit: 0 incidents in 2 merged PRs');
  });

  it('finds a planted merge that has no gate status', () => {
    const { gh, audit } = setup();
    seed(gh, [mergedPr(1, AFTER), mergedPr(2, AFTER)], { 1: 'success' });
    const r = audit('-R', 'hieplam/tribe', '--since', SINCE);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`incident: PR 2 ${sha(2).slice(0, 7)} no status`);
    expect(r.out.trim().split('\n').at(-1)).toBe('merge-audit: 1 incidents in 2 merged PRs');
  });

  it('finds a merge whose gate status is failure', () => {
    const { gh, audit } = setup();
    seed(gh, [mergedPr(3, AFTER)], { 3: 'failure' });
    const r = audit('-R', 'hieplam/tribe', '--since', SINCE);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`incident: PR 3 ${sha(3).slice(0, 7)} status failure`);
  });

  it('ignores PRs merged before --since and PRs that are not merged', () => {
    const { gh, audit } = setup();
    seed(gh, [mergedPr(4, '2026-10-15T00:00:00.000Z'), mergedPr(5, null as unknown as string, { state: 'OPEN' })], {});
    const r = audit('-R', 'hieplam/tribe', '--since', SINCE);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe('merge-audit: 0 incidents in 0 merged PRs');
  });

  it('prints one JSON object with --json', () => {
    const { gh, audit } = setup();
    seed(gh, [mergedPr(1, AFTER), mergedPr(2, AFTER)], { 1: 'success' });
    const r = audit('-R', 'hieplam/tribe', '--since', SINCE, '--json');
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out)).toEqual({ incidents: [{ pr: 2, sha: sha(2), why: 'no status' }], ratified: [], merged: 2 });
  });

  it('lists a ratified merge in the text output and in --json, and the exit code stays 0', () => {
    const { gh, audit } = setup();
    const at = '2026-11-01T09:30:00.000Z';
    seed(gh, [mergedPr(1, AFTER), mergedPr(2, AFTER)], { 1: 'success', 2: 'success' }, { 2: `gate: ratified ${at}` });
    const text = audit('-R', 'hieplam/tribe', '--since', SINCE);
    expect(text.code).toBe(0);
    expect(text.out.trim().split('\n')).toEqual([`ratified: PR 2 ${at}`, 'merge-audit: 0 incidents in 2 merged PRs']);
    const json = audit('-R', 'hieplam/tribe', '--since', SINCE, '--json');
    expect(json.code).toBe(0);
    expect(JSON.parse(json.out)).toEqual({ incidents: [], ratified: [{ pr: 2, at }], merged: 2 });
  });

  it('prints an empty ratified list when no merge was ratified', () => {
    const { gh, audit } = setup();
    seed(gh, [mergedPr(1, AFTER)], { 1: 'success' }, { 1: 'gate: every step passed' });
    const r = audit('-R', 'hieplam/tribe', '--since', SINCE, '--json');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ incidents: [], ratified: [], merged: 1 });
  });

  it('does not list a ratified description on a failed status, which stays an incident', () => {
    const { gh, audit } = setup();
    seed(gh, [mergedPr(3, AFTER)], { 3: 'failure' }, { 3: 'gate: ratified 2026-11-01T09:30:00.000Z' });
    const r = audit('-R', 'hieplam/tribe', '--since', SINCE, '--json');
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).ratified).toEqual([]);
  });

  it('exits 2 when --since is missing, or is not a date', () => {
    const { audit } = setup();
    const missing = audit('-R', 'hieplam/tribe');
    expect(missing.code).toBe(2);
    expect(missing.out).toBe('');
    expect(missing.err).toContain('--since');
    const bad = audit('-R', 'hieplam/tribe', '--since', 'yesterday');
    expect(bad.code).toBe(2);
    expect(bad.err).toContain('--since');
  });

  it('exits 2 on a gh error and never prints "0 incidents"', () => {
    const { gh, audit } = setup();
    seed(gh, [mergedPr(1, AFTER)], { 1: 'success' });
    // A corrupt world file makes the fake gh fail with exit 1.
    writeFileSync(gh.world, '{ not json');
    const r = audit('-R', 'hieplam/tribe', '--since', SINCE);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain('incidents');
    expect(r.err).toContain('merge-audit');
  });
});
