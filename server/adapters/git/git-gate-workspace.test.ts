import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isRealRed } from '../../../shared/domain/gate-commands';
import { createBareRepo, type BareRepo } from '../../../tests/support/bare-repo';
import type { GateTree } from '../../ports/gate-workspace';
import { NodeCommandRunner } from '../process/node-command-runner';
import { GitGateWorkspace } from './git-gate-workspace';

const JOB = 'job-1';
const RUN_MS = 30_000;

let bare: BareRepo;
let root: string;
let repoPath: string;
let dev: string;
let ws: GitGateWorkspace;

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Adds one commit to `main` in the bare repository. */
function commitMain(files: Record<string, string>): string {
  git(dev, ['checkout', '-q', 'main']);
  git(dev, ['pull', '-q', 'origin', 'main']);
  const sha = bare.commit(dev, files, 'main change');
  bare.push(dev, 'main');
  return sha;
}

/** Publishes the branch `feat/x`, one commit on top of `main`. */
function openPr(files: Record<string, string>, drop: string[] = []): string {
  git(dev, ['checkout', '-q', 'main']);
  git(dev, ['pull', '-q', 'origin', 'main']);
  bare.branch(dev, 'feat/x');
  for (const path of drop) rmSync(join(dev, path));
  const sha = bare.commit(dev, files, 'pull request change');
  bare.push(dev, 'feat/x');
  return sha;
}

async function fetchPr(headSha: string) {
  return ws.fetch(repoPath, { headRef: 'feat/x', headSha });
}

async function preparedTree(headSha: string): Promise<GateTree> {
  const { mainSha } = await fetchPr(headSha);
  const prepared = await ws.prepare(repoPath, JOB, mainSha, headSha);
  if (!prepared.ok) throw new Error(prepared.output);
  return prepared.tree;
}

function statusLetters(files: { status: string; path: string }[]): string[] {
  return files.map((f) => `${f.status} ${f.path}`).sort();
}

function inTree(tree: GateTree, path: string): string | null {
  const full = join(tree.dir, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

function worktreeCount(): number {
  return git(repoPath, ['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree ')).length;
}

beforeEach(() => {
  bare = createBareRepo();
  root = mkdtempSync(join(tmpdir(), 'lc-gate-ws-'));
  dev = bare.clone();
  git(dev, ['checkout', '-q', 'main']);
  repoPath = bare.clone();
  ws = new GitGateWorkspace({ runner: new NodeCommandRunner(), root });
});

afterEach(async () => {
  await ws.remove(repoPath, JOB);
  rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  bare.dispose();
});

describe('gate_workspace', { timeout: 60_000 }, () => {
  it('fetchMain moves only origin/main to the new commit, with no pull request to fetch', async () => {
    const sha = commitMain({ 'goals/charter.json': '{}
' });

    expect(await ws.fetchMain(repoPath)).toBe(sha);
    expect(await ws.readAt(repoPath, sha, 'goals/charter.json')).toBe('{}
');
  });

  it('readAt gives the text of main while the PR changes the file and the checkout and the worktree hold the PR text', async () => {
    commitMain({ 'goals/exam.json': 'the exam of main' });
    const headSha = openPr({ 'goals/exam.json': 'the exam of the pull request' });
    const { mainSha } = await fetchPr(headSha);
    await ws.prepare(repoPath, JOB, mainSha, headSha);
    git(repoPath, ['checkout', '-q', '--detach', headSha]);

    expect(readFileSync(join(root, JOB, 'goals/exam.json'), 'utf8')).toBe('the exam of the pull request');
    expect(readFileSync(join(repoPath, 'goals/exam.json'), 'utf8')).toBe('the exam of the pull request');
    expect(await ws.readAt(repoPath, mainSha, 'goals/exam.json')).toBe('the exam of main');
    expect(await ws.readAt(repoPath, headSha, 'goals/exam.json')).toBe('the exam of the pull request');
  });

  it('readAt gives null for a path that the commit does not hold, and for a folder', async () => {
    commitMain({ 'goals/exam.json': 'x' });
    const { mainSha } = await fetchPr(openPr({ 'other.txt': 'y' }));
    expect(await ws.readAt(repoPath, mainSha, 'goals/none.json')).toBeNull();
    expect(await ws.readAt(repoPath, mainSha, 'goals')).toBeNull();
    expect(await ws.readAt(repoPath, mainSha, 'other.txt')).toBeNull();
  });

  it('listAt gives the .json names of main and omits a file that only the PR has', async () => {
    commitMain({ 'goals/verify/b.json': '{}', 'goals/verify/a.json': '{}', 'goals/verify/notes.txt': 'x', 'goals/verify/deep/c.json': '{}' });
    const headSha = openPr({ 'goals/verify/from-pr.json': '{}' });
    const { mainSha } = await fetchPr(headSha);
    expect(await ws.listAt(repoPath, mainSha, 'goals/verify')).toEqual(['a.json', 'b.json']);
    expect(await ws.listAt(repoPath, headSha, 'goals/verify')).toEqual(['a.json', 'b.json', 'from-pr.json']);
    expect(await ws.listAt(repoPath, mainSha, 'goals/none')).toEqual([]);
  });

  it('fetch reports main and whether the branch still holds the expected head', async () => {
    const headSha = openPr({ 'a.txt': '1' });
    expect(await fetchPr(headSha)).toEqual({ mainSha: bare.sha('main'), headMatches: true });
    expect(await fetchPr('0'.repeat(40))).toEqual({ mainSha: bare.sha('main'), headMatches: false });
  });

  it('changed gives A, M and D', async () => {
    commitMain({ 'keep.txt': 'x', 'edit.txt': 'old', 'gone.txt': 'x' });
    const headSha = openPr({ 'edit.txt': 'new', 'new.txt': 'x' }, ['gone.txt']);
    const { mainSha } = await fetchPr(headSha);
    const { mergeBase, files } = await ws.changed(repoPath, mainSha, headSha);
    expect(mergeBase).toBe(mainSha);
    expect(statusLetters(files)).toEqual(['A new.txt', 'D gone.txt', 'M edit.txt']);
  });

  it('changed gives a rename as a delete plus an add', async () => {
    const body = 'a body that is long enough for git to see the rename\n'.repeat(5);
    commitMain({ 'old-name.txt': body });
    const headSha = openPr({ 'new-name.txt': body }, ['old-name.txt']);
    const { mainSha } = await fetchPr(headSha);
    const { files } = await ws.changed(repoPath, mainSha, headSha);
    expect(statusLetters(files)).toEqual(['A new-name.txt', 'D old-name.txt']);
  });

  it('changed keeps a file name with a space exactly', async () => {
    const headSha = openPr({ 'a folder/a file.txt': 'x' });
    const { mainSha } = await fetchPr(headSha);
    const { files } = await ws.changed(repoPath, mainSha, headSha);
    expect(files).toEqual([{ status: 'A', path: 'a folder/a file.txt' }]);
  });

  it('changed does not list a commit that main got after the branch started', async () => {
    const headSha = openPr({ 'pr.txt': 'x' });
    const mergeBase = bare.sha('main');
    commitMain({ 'later-on-main.txt': 'x' });
    const { mainSha } = await fetchPr(headSha);
    expect(mainSha).not.toBe(mergeBase);
    const changed = await ws.changed(repoPath, mainSha, headSha);
    expect(changed.mergeBase).toBe(mergeBase);
    expect(statusLetters(changed.files)).toEqual(['A pr.txt']);
  });

  it('leaves a dirty checkout untouched through a whole job', async () => {
    commitMain({ 'tracked.txt': 'on main', 'impl.txt': 'old' });
    const headSha = openPr({ 'impl.txt': 'new' });
    git(repoPath, ['pull', '-q', 'origin', 'main']);
    git(repoPath, ['checkout', '-q', '-b', 'owner-work']);
    writeFileSync(join(repoPath, 'tracked.txt'), 'unsaved work of the owner');
    writeFileSync(join(repoPath, 'untracked.txt'), 'more unsaved work');
    const headBefore = git(repoPath, ['rev-parse', 'HEAD']);
    const statusBefore = git(repoPath, ['status', '--porcelain', '--branch']);

    const tree = await preparedTree(headSha);
    await ws.stubRestore(tree, [{ status: 'M', path: 'impl.txt' }], []);
    await ws.stubUndo(tree);
    await ws.remove(repoPath, JOB);

    expect(git(repoPath, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(git(repoPath, ['status', '--porcelain', '--branch'])).toBe(statusBefore);
    expect(readFileSync(join(repoPath, 'tracked.txt'), 'utf8')).toBe('unsaved work of the owner');
    expect(readFileSync(join(repoPath, 'untracked.txt'), 'utf8')).toBe('more unsaved work');
  });

  it('prepare gives a tree that holds the later commit of main and the PR file', async () => {
    const headSha = openPr({ 'pr.txt': 'from the pull request' });
    const mainSha = commitMain({ 'later-on-main.txt': 'from main' });
    const tree = await preparedTree(headSha);

    expect(tree.dir).toBe(join(root, JOB));
    expect(tree.baseSha).toBe(mainSha);
    expect(tree.rebasedSha).not.toBe(headSha);
    expect(git(tree.dir, ['rev-parse', 'HEAD']).trim()).toBe(tree.rebasedSha);
    expect(git(tree.dir, ['rev-parse', 'HEAD~1']).trim()).toBe(mainSha);
    expect(inTree(tree, 'pr.txt')).toBe('from the pull request');
    expect(inTree(tree, 'later-on-main.txt')).toBe('from main');
  });

  it('prepare gives the output with the file name on a conflict, and leaves no folder and no worktree', async () => {
    commitMain({ 'both.txt': 'first' });
    const headSha = openPr({ 'both.txt': 'the pull request' });
    const mainSha = commitMain({ 'both.txt': 'main' });
    await fetchPr(headSha);

    const prepared = await ws.prepare(repoPath, JOB, mainSha, headSha);

    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.output).toContain('both.txt');
    expect(existsSync(join(root, JOB))).toBe(false);
    expect(worktreeCount()).toBe(1);
  });

  it('prepare replaces what a crash left: a registered worktree, then a plain folder', async () => {
    const headSha = openPr({ 'pr.txt': 'x' });
    const crashed = await preparedTree(headSha);
    writeFileSync(join(crashed.dir, 'left-by-the-crash.txt'), 'x');

    const again = await preparedTree(headSha);
    expect(inTree(again, 'left-by-the-crash.txt')).toBeNull();
    expect(worktreeCount()).toBe(2);

    await ws.remove(repoPath, JOB);
    mkdirSync(join(root, JOB, 'not-a-worktree'), { recursive: true });
    const third = await preparedTree(headSha);
    expect(existsSync(join(third.dir, 'not-a-worktree'))).toBe(false);
    expect(inTree(third, 'pr.txt')).toBe('x');
  });

  it('runs no hook of core.hooksPath in fetch, prepare, restore, undo and remove', async () => {
    const hooks = mkdtempSync(join(root, '..', 'lc-gate-hooks-'));
    const marker = join(hooks, 'hook-ran.txt');
    const script = `#!/bin/sh\necho ran >> "${marker.replace(/\\/g, '/')}"\n`;
    for (const name of ['post-checkout', 'pre-rebase', 'post-rewrite', 'pre-commit', 'post-commit', 'reference-transaction']) {
      writeFileSync(join(hooks, name), script, { mode: 0o755 });
    }
    try {
      git(repoPath, ['config', 'core.hooksPath', hooks.replace(/\\/g, '/')]);
      // The control: the hooks do run for a plain git call in this repository.
      git(repoPath, ['checkout', '-q', '-b', 'control']);
      expect(existsSync(marker)).toBe(true);
      rmSync(marker);

      const headSha = openPr({ 'impl.txt': 'new' });
      commitMain({ 'later-on-main.txt': 'x' });
      const tree = await preparedTree(headSha);
      await ws.stubRestore(tree, [{ status: 'A', path: 'impl.txt' }], []);
      await ws.stubUndo(tree);
      await ws.remove(repoPath, JOB);

      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(hooks, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('stubRestore puts back M and D, deletes A, handles a file that became a folder, and works past 50 paths', async () => {
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`many/${i}.txt`, 'old']));
    commitMain({ ...many, 'edit.txt': 'old', 'gone.txt': 'old', swap: 'a file on main' });
    const newMany = Object.fromEntries(Object.keys(many).map((k) => [k, 'new']));
    const headSha = openPr({ ...newMany, 'edit.txt': 'new', 'added.txt': 'new', 'swap/inner.txt': 'new' }, ['gone.txt', 'swap']);
    const tree = await preparedTree(headSha);
    const { files } = await ws.changed(repoPath, tree.baseSha, headSha);

    const restored = await ws.stubRestore(tree, files, []);

    expect([...restored].sort()).toEqual(files.map((f) => f.path).sort());
    expect(inTree(tree, 'edit.txt')).toBe('old');
    expect(inTree(tree, 'gone.txt')).toBe('old');
    expect(inTree(tree, 'added.txt')).toBeNull();
    expect(inTree(tree, 'swap')).toBe('a file on main');
    expect(Object.keys(many).filter((k) => inTree(tree, k) !== 'old')).toEqual([]);
  });

  it('stubRestore keeps every file that matches a test glob at the PR version', async () => {
    commitMain({ 'impl.txt': 'old', 'tests/old.test.txt': 'old' });
    const headSha = openPr({ 'impl.txt': 'new', 'tests/old.test.txt': 'new', 'tests/deep/added.test.txt': 'new' });
    const tree = await preparedTree(headSha);
    const { files } = await ws.changed(repoPath, tree.baseSha, headSha);

    const restored = await ws.stubRestore(tree, files, ['tests/**']);

    expect(restored).toEqual(['impl.txt']);
    expect(inTree(tree, 'impl.txt')).toBe('old');
    expect(inTree(tree, 'tests/old.test.txt')).toBe('new');
    expect(inTree(tree, 'tests/deep/added.test.txt')).toBe('new');
  });

  it('real stub run: a check that imports the implementation exits 0 at head, 1 after stubRestore, 0 after stubUndo', async () => {
    commitMain({ 'impl.mjs': 'export const answer = () => 0;\n' });
    const check = [
      "import { answer } from '../impl.mjs';",
      "if (answer() !== 42) { console.error('no implementation'); process.exit(1); }",
      "console.log('implementation works');",
      '',
    ].join('\n');
    const headSha = openPr({ 'impl.mjs': 'export const answer = () => 42;\n', 'tests/check.mjs': check });
    const tree = await preparedTree(headSha);
    const { files } = await ws.changed(repoPath, tree.baseSha, headSha);
    const line = 'node tests/check.mjs';

    const atHead = await ws.run(tree, { line, env: {}, timeoutMs: RUN_MS });
    expect(atHead.stderr).toBe('');
    expect(atHead.exitCode).toBe(0);
    expect(atHead.stdout).toContain('implementation works');

    expect(await ws.stubRestore(tree, files, ['tests/**'])).toEqual(['impl.mjs']);
    const stubbed = await ws.run(tree, { line, env: {}, timeoutMs: RUN_MS });
    expect(stubbed.exitCode).toBe(1);
    expect(stubbed.stderr).toContain('no implementation');
    expect(isRealRed(stubbed)).toBe(true);

    const noProgram = await ws.run(tree, { line: 'no-such-program-lc-k4', env: {}, timeoutMs: RUN_MS });
    expect(isRealRed(noProgram)).toBe(false);

    await ws.stubUndo(tree);
    const undone = await ws.run(tree, { line, env: {}, timeoutMs: RUN_MS });
    expect(undone.exitCode).toBe(0);
    expect(undone.stdout).toContain('implementation works');
  });

  it('stubUndo gives the exact rebased tree, and status --porcelain is empty', async () => {
    commitMain({ 'impl.txt': 'old', 'gone.txt': 'old' });
    const headSha = openPr({ 'impl.txt': 'new', 'added.txt': 'new' }, ['gone.txt']);
    const tree = await preparedTree(headSha);
    const treeBefore = git(tree.dir, ['rev-parse', 'HEAD^{tree}']);
    const { files } = await ws.changed(repoPath, tree.baseSha, headSha);
    await ws.stubRestore(tree, files, []);
    expect(git(tree.dir, ['status', '--porcelain'])).not.toBe('');

    await ws.stubUndo(tree);

    expect(git(tree.dir, ['status', '--porcelain'])).toBe('');
    expect(git(tree.dir, ['rev-parse', 'HEAD']).trim()).toBe(tree.rebasedSha);
    expect(git(tree.dir, ['rev-parse', 'HEAD^{tree}'])).toBe(treeBefore);
    expect(inTree(tree, 'impl.txt')).toBe('new');
    expect(inTree(tree, 'gone.txt')).toBeNull();
    expect(inTree(tree, 'added.txt')).toBe('new');
  });

  it('stubUndo removes a file that a run made and keeps an ignored one', async () => {
    commitMain({ '.gitignore': 'node_modules/\n' });
    const tree = await preparedTree(openPr({ 'impl.txt': 'new' }));
    mkdirSync(join(tree.dir, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(tree.dir, 'node_modules', 'pkg', 'index.js'), 'kept');
    mkdirSync(join(tree.dir, 'made-by-a-run'));
    writeFileSync(join(tree.dir, 'made-by-a-run', 'file.txt'), 'x');

    await ws.stubUndo(tree);

    expect(existsSync(join(tree.dir, 'made-by-a-run'))).toBe(false);
    expect(inTree(tree, 'node_modules/pkg/index.js')).toBe('kept');
  });

  it('run passes env and runs in the tree', async () => {
    const script = 'process.stdout.write(process.env.LC_K4_VALUE + "|" + process.cwd());\n';
    const tree = await preparedTree(openPr({ 'show.mjs': script }));
    const result = await ws.run(tree, { line: 'node show.mjs', env: { LC_K4_VALUE: 'from-the-gate' }, timeoutMs: RUN_MS });
    expect(result.exitCode).toBe(0);
    const [value, cwd] = result.stdout.split('|');
    expect(value).toBe('from-the-gate');
    expect(cwd?.toLowerCase()).toBe(tree.dir.toLowerCase());
  });

  it('run gives a line with double quotes to the shell exactly as written', async () => {
    const tree = await preparedTree(openPr({ 'pr.txt': 'x' }));
    const result = await ws.run(tree, { line: 'node -e "console.log(1+1)"', env: {}, timeoutMs: RUN_MS });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('2');
  });

  it('run keeps the failing exit of a line with double quotes', async () => {
    const tree = await preparedTree(openPr({ 'pr.txt': 'x' }));
    const result = await ws.run(tree, { line: 'node -e "process.exit(3)"', env: {}, timeoutMs: RUN_MS });
    expect(result.exitCode).toBe(3);
  });

  it('remove takes the folder and the worktree away, and a second remove does no harm', async () => {
    const tree = await preparedTree(openPr({ 'pr.txt': 'x' }));
    expect(worktreeCount()).toBe(2);

    await ws.remove(repoPath, JOB);
    expect(existsSync(tree.dir)).toBe(false);
    expect(worktreeCount()).toBe(1);

    await ws.remove(repoPath, JOB);
    expect(readdirSync(root)).toEqual([]);
    expect(worktreeCount()).toBe(1);
  });
});
