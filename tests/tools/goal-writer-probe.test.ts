// Oracle of the goal-writer probe (task W2 of epic 217): every test runs the real script as a child process,
// with a clone of a local bare repository as the working folder and the fake gh as `gh`.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseProbeLine } from '../../shared/domain/goal-loop.ts';
import { createBareRepo } from '../support/bare-repo.ts';
import { createFakeGh, type FakeGh, type FakeIssue } from '../support/fake-gh-kit.ts';

const SCRIPT = join(import.meta.dirname, '..', '..', 'scripts', 'goal-writer-probe.mjs');
const PLAN_LINE =
  '{"v":1,"action":"plan","tasks":[],"reason":"","resource":null,"until":null,"plan":{"key":"goal-writer","failing":[]},"issues":[],"goals":null}';
const T0 = '2026-11-02T10:00:00.000Z';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

interface World {
  gh: FakeGh;
  dir: string;
  seed(issue: Partial<FakeIssue> & { number: number }): void;
  run(args?: string[], env?: Record<string, string>): { code: number | null; out: string; err: string; line: unknown };
}

function world(opts: { charter?: boolean } = {}): World {
  const bare = createBareRepo();
  const gh = createFakeGh(bare);
  cleanups.push(() => {
    gh.dispose();
    bare.dispose();
  });
  if (opts.charter !== false) {
    const seedDir = bare.clone();
    bare.commit(seedDir, { 'goals/charter.json': '{"refusalWindow":{"enabled":false,"hours":8}}\n' }, 'add the charter');
    bare.push(seedDir, 'main');
  }
  const dir = bare.clone();
  const seed: World['seed'] = (issue) => {
    const w = gh.read();
    w.issues.push({
      title: 'T',
      body: '',
      state: 'OPEN',
      labels: [],
      comments: [],
      url: `https://github.com/fake/repo/issues/${issue.number}`,
      createdAt: T0,
      updatedAt: T0,
      closedAt: null,
      ...issue,
    });
    writeFileSync(gh.world, JSON.stringify(w));
  };
  const run: World['run'] = (args = ['-R', 'fake/repo'], env = {}) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ...gh.env, GOAL_WRITER_NOW: T0, ...env },
    });
    const out = String(r.stdout);
    const err = String(r.stderr);
    // Every line that the script prints must pass the parser of the console.
    if (out.trim() !== '') {
      const parsed = parseProbeLine(out);
      expect(parsed.ok, `parseProbeLine rejected: ${out}`).toBe(true);
    }
    return { code: r.status, out, err, line: out.trim() === '' ? null : JSON.parse(out.trim()) };
  };
  return { gh, dir, seed, run };
}

describe('goal-writer-probe', () => {
  it('prints blocked with the missing file when origin/main has no charter', () => {
    const w = world({ charter: false });
    const r = w.run();
    expect(r.code).toBe(0);
    expect(r.line).toEqual({ v: 1, action: 'blocked', reason: 'no goals/charter.json on origin/main', issues: ['goals/charter.json'] });
    expect(w.gh.read().calls).toHaveLength(0);
  });

  it('skips when an open issue has the Goal manifest line', () => {
    const w = world();
    w.seed({ number: 1, body: 'Epic body\n\nGoal manifest: goals/2026-11-01-x.json\nmore' });
    const r = w.run();
    expect((r.line as { action: string }).action).toBe('skip');
    expect(existsSync(join(w.dir, '.git', 'castraferrum-goal-writer.json'))).toBe(false);
  });

  it('plans when a body only quotes the Goal manifest line in backticks', () => {
    const w = world();
    w.seed({ number: 1, body: 'The line `Goal manifest: goals/x.json` starts a goal.' });
    expect(w.run().out.trim()).toBe(PLAN_LINE);
  });

  it('skips when an open issue has the goal-card label', () => {
    const w = world();
    w.seed({ number: 4, labels: [{ name: 'goal-card' }] });
    const r = w.run();
    expect((r.line as { action: string }).action).toBe('skip');
    expect(existsSync(join(w.dir, '.git', 'castraferrum-goal-writer.json'))).toBe(false);
  });

  it('prints the exact plan line and writes the stamp when nothing is open', () => {
    const w = world();
    const r = w.run();
    expect(r.code).toBe(0);
    expect(r.out).toBe(`${PLAN_LINE}\n`);
    const stamp = JSON.parse(readFileSync(join(w.dir, '.git', 'castraferrum-goal-writer.json'), 'utf8'));
    expect(stamp).toEqual({ at: T0 });
  });

  it('plans when the only epic is closed', () => {
    const w = world();
    w.seed({ number: 1, body: 'Goal manifest: goals/x.json', state: 'CLOSED', closedAt: T0 });
    expect(w.run().out.trim()).toBe(PLAN_LINE);
  });

  it('skips a second call inside the gap', () => {
    const w = world();
    expect(w.run().out.trim()).toBe(PLAN_LINE);
    const second = w.run(['-R', 'fake/repo'], { GOAL_WRITER_NOW: '2026-11-02T15:59:00.000Z' });
    expect((second.line as { action: string }).action).toBe('skip');
  });

  it('plans again 7 hours after the stamp', () => {
    const w = world();
    expect(w.run().out.trim()).toBe(PLAN_LINE);
    const later = w.run(['-R', 'fake/repo'], { GOAL_WRITER_NOW: '2026-11-02T17:00:00.000Z' });
    expect(later.out.trim()).toBe(PLAN_LINE);
  });

  it('exits 1 with no line when gh fails, and does not read that as nothing open', () => {
    const w = world();
    const r = w.run(['-R', 'fake/repo'], { LOOPS_GH_BIN: join(tmpdir(), 'lc-no-such-gh.mjs') });
    expect(r.code).toBe(1);
    expect(r.out).toBe('');
    expect(r.err).toContain('goal-writer-probe: gh failed');
    expect(existsSync(join(w.dir, '.git', 'castraferrum-goal-writer.json'))).toBe(false);
  });

  it('exits 2 and names the missing -R', () => {
    const w = world();
    const r = w.run([]);
    expect(r.code).toBe(2);
    expect(r.out).toBe('');
    expect(r.err).toContain('goal-writer-probe: -R <owner/name> is required');
  });

  it('prints a line that the real parseProbeLine accepts, for each action', () => {
    const blocked = world({ charter: false });
    const skip = world();
    skip.seed({ number: 9, labels: [{ name: 'goal-card' }] });
    const plan = world();
    const actions = [blocked, skip, plan].map((w) => {
      const out = w.run().out;
      const parsed = parseProbeLine(out);
      expect(parsed.ok).toBe(true);
      return parsed.ok ? parsed.line.action : null;
    });
    expect(actions).toEqual(['blocked', 'skip', 'plan']);
  });
});
