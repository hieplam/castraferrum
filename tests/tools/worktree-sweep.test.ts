// Oracle of scripts/worktree-sweep.mjs. The script runs as a child process in a clone of a local bare repository,
// against the fake gh (F2): no network, no real repository. A worktree goes only when its work is on GitHub and its
// pull request is merged or closed. Every other worktree, and every folder that is not a worktree, stays.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createBareRepo, type BareRepo } from '../support/bare-repo.ts';
import { createFakeGh, type FakeGh, type FakePr } from '../support/fake-gh-kit.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const script = join(root, 'scripts', 'worktree-sweep.mjs');
// A port where no Postgres listens, so the database step is tried and reports that it cannot connect.
const NO_DB = 'postgres://loops:loops@127.0.0.1:1/postgres';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

const IDENT = ['-c', 'user.name=Fake Dev', '-c', 'user.email=fake@example.com', '-c', 'commit.gpgsign=false'];
const git = (cwd: string, ...args: string[]) => execFileSync('git', [...IDENT, ...args], { cwd, encoding: 'utf8' }).trim();

interface World {
  repo: BareRepo;
  gh: FakeGh;
  main: string;
  /** Adds a worktree `<main>-<lane>` on a new branch with one pushed commit; returns its folder and head sha. */
  lane(lane: string, branch: string): { dir: string; sha: string };
  pr(number: number, branch: string, sha: string, patch?: Partial<FakePr>): void;
  sweep(args?: string[], cwd?: string): { code: number | null; out: string; err: string };
  branches(): string[];
}

function setup(): World {
  const repo = createBareRepo();
  cleanups.push(() => repo.dispose());
  const gh = createFakeGh(repo);
  cleanups.push(() => gh.dispose());
  const main = repo.clone();
  return {
    repo,
    gh,
    main,
    lane(lane, branch) {
      const dir = join(dirname(main), `${basename(main)}-${lane}`);
      git(main, 'worktree', 'add', '-q', dir, '-b', branch);
      const sha = repo.commit(dir, { [`${lane}.txt`]: `${lane}\n` }, `work of ${lane}`);
      repo.push(dir, branch);
      return { dir, sha };
    },
    pr(number, branch, sha, patch = {}) {
      const w = gh.read();
      w.prs.push({
        number,
        title: `PR ${number}`,
        body: '',
        state: 'MERGED',
        headRefName: branch,
        baseRefName: 'main',
        headRefOid: sha,
        mergeCommit: null,
        url: `https://github.com/hieplam/tribe/pull/${number}`,
        createdAt: '2026-11-01T00:00:00.000Z',
        mergedAt: '2026-11-02T00:00:00.000Z',
        ...patch,
      } as FakePr);
      writeFileSync(gh.world, JSON.stringify(w, null, 2));
    },
    sweep(args = [], cwd = main) {
      const r = spawnSync(process.execPath, [script, ...args], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, ...gh.env, LOOPS_SWEEP_DB_URL: NO_DB },
      });
      return { code: r.status, out: r.stdout, err: r.stderr };
    },
    branches: () => git(main, 'branch', '--format=%(refname:short)').split('\n'),
  };
}

describe('worktree-sweep', () => {
  it('removes the worktree and the branch of a merged pull request, and keeps an open one', () => {
    const w = setup();
    const merged = w.lane('merged', 'feat/merged');
    const open = w.lane('open', 'feat/open');
    w.pr(1, 'feat/merged', merged.sha);
    w.pr(2, 'feat/open', open.sha, { state: 'OPEN', mergedAt: null });

    const r = w.sweep();
    expect(r.code).toBe(0);
    expect(r.out).toContain(`removed: ${merged.dir.replaceAll('\\', '/')} (feat/merged, PR #1 MERGED)`);
    expect(r.out).toContain('kept: ');
    expect(r.out).toContain('feat/open: PR #2 is OPEN');
    expect(existsSync(merged.dir)).toBe(false);
    expect(existsSync(open.dir)).toBe(true);
    expect(w.branches()).not.toContain('feat/merged');
    expect(w.branches()).toContain('feat/open');
    // The lane databases are named from the folder; with no Postgres the step says so and removes nothing more.
    expect(r.out).toContain('databases not dropped (loops_merged_test, loops_merged_live_test)');
  });

  it('removes the worktree of a closed pull request whose head is pushed', () => {
    const w = setup();
    const closed = w.lane('closed', 'feat/closed');
    w.pr(3, 'feat/closed', closed.sha, { state: 'CLOSED' as FakePr['state'], mergedAt: null });
    expect(w.sweep().out).toContain('(feat/closed, PR #3 CLOSED)');
    expect(existsSync(closed.dir)).toBe(false);
  });

  it('keeps a merged worktree with uncommitted changes, or with a commit that is not the head of the pull request', () => {
    const w = setup();
    const dirty = w.lane('dirty', 'feat/dirty');
    const ahead = w.lane('ahead', 'feat/ahead');
    w.pr(4, 'feat/dirty', dirty.sha);
    w.pr(5, 'feat/ahead', ahead.sha);
    writeFileSync(join(dirty.dir, 'notes.md'), 'not committed\n');
    w.repo.commit(ahead.dir, { 'more.txt': 'more\n' }, 'a commit after the merge');

    const r = w.sweep();
    expect(r.out).toContain('feat/dirty: uncommitted changes');
    expect(r.out).toMatch(/feat\/ahead: HEAD [0-9a-f]{7} is not the head [0-9a-f]{7} of PR #5/);
    expect(existsSync(dirty.dir)).toBe(true);
    expect(existsSync(ahead.dir)).toBe(true);
    expect(w.branches()).toEqual(expect.arrayContaining(['feat/dirty', 'feat/ahead']));
  });

  it('keeps a worktree with no pull request, and does not count a pull request from a fork', () => {
    const w = setup();
    const fresh = w.lane('fresh', 'feat/fresh');
    w.pr(6, 'feat/fresh', fresh.sha, { isCrossRepository: true });
    const r = w.sweep();
    expect(r.out).toContain('feat/fresh: no pull request');
    expect(existsSync(fresh.dir)).toBe(true);
  });

  it('keeps the worktree that the sweep runs in', () => {
    const w = setup();
    const here = w.lane('here', 'feat/here');
    w.pr(7, 'feat/here', here.sha);
    const r = w.sweep([], here.dir);
    expect(r.out).toContain('feat/here: the sweep runs in this worktree');
    expect(existsSync(here.dir)).toBe(true);
  });

  it('--dry removes nothing and prints what it would remove', () => {
    const w = setup();
    const merged = w.lane('merged', 'feat/merged');
    w.pr(8, 'feat/merged', merged.sha);
    const r = w.sweep(['--dry']);
    expect(r.out).toContain('would remove: ');
    expect(existsSync(merged.dir)).toBe(true);
    expect(w.branches()).toContain('feat/merged');
  });

  it('a failed gh call removes nothing and exits 2', () => {
    const w = setup();
    const merged = w.lane('merged', 'feat/merged');
    w.pr(9, 'feat/merged', merged.sha);
    const world = w.gh.read();
    world.failNext = ['pr list'];
    writeFileSync(w.gh.world, JSON.stringify(world, null, 2));
    const r = w.sweep();
    expect(r.code).toBe(2);
    expect(r.err).toContain('gh pr list failed');
    expect(existsSync(merged.dir)).toBe(true);
  });

  it('reports a folder next to the repository that is not a worktree, and leaves it', () => {
    const w = setup();
    const copy = join(dirname(w.main), `${basename(w.main)}-copy`);
    mkdirSync(copy);
    writeFileSync(join(copy, 'a.txt'), 'a copy\n');
    const r = w.sweep();
    expect(r.out).toContain(`not a worktree: ${copy.replaceAll('\\', '/')} (look at it, then delete it by hand)`);
    expect(existsSync(copy)).toBe(true);
  });

  it('--quiet prints only the worktrees that it removes', () => {
    const w = setup();
    const merged = w.lane('merged', 'feat/merged');
    w.lane('fresh', 'feat/fresh');
    w.pr(10, 'feat/merged', merged.sha);
    const r = w.sweep(['--quiet']);
    expect(r.out).toContain('removed: ');
    expect(r.out).not.toContain('kept: ');
  });
});
