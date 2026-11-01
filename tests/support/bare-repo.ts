// A real local git repository that plays "origin" in tests (F2). Used with `fake-gh-kit.ts`:
// `createFakeGh(bare)` makes `gh pr merge` run real git in `bare.bare`.
//
// How to use it:
//   const repo = createBareRepo();            // bare repository, `main` has one first commit
//   const dir = repo.clone();                 // a working clone (cleaned by `repo.dispose()`)
//   repo.branch(dir, 'feat/x');               // create and check out a branch in the clone
//   repo.commit(dir, { 'a.txt': '1' }, 'msg');// write files, commit, returns the commit sha
//   repo.push(dir, 'feat/x');                 // publish the branch to the bare repository
// How to read it back:
//   repo.sha('main')                          // sha of a branch in the bare repository
//   repo.show('main', 'a.txt')                // exact content of a file on a branch
// A test file that seeds the same repository for each test can seed it once and call `repo.copy()` for each test.
// Always call `repo.dispose()` (an afterEach) - it deletes the bare repository and every clone.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface BareRepo {
  /** Absolute path of the bare repository. */
  bare: string;
  clone(): string;
  commit(dir: string, files: Record<string, string>, message: string): string;
  branch(dir: string, name: string): void;
  push(dir: string, branch: string): void;
  sha(branch: string): string;
  show(branch: string, path: string): string;
  /** A new, separate bare repository with the same commits. Dispose it on its own. */
  copy(): BareRepo;
  dispose(): void;
}

const IDENT = ['-c', 'user.name=Fake Dev', '-c', 'user.email=fake@example.com', '-c', 'commit.gpgsign=false'];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', [...IDENT, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function newRoot(): { root: string; bare: string } {
  const root = mkdtempSync(join(tmpdir(), 'lc-fake-bare-'));
  return { root, bare: join(root, 'world.bare') };
}

export function createBareRepo(): BareRepo {
  const { root, bare } = newRoot();
  git(root, ['init', '--bare', '-b', 'main', bare]);
  const repo = openBareRepo(root, bare);
  // The first commit on main.
  const first = repo.clone();
  git(first, ['checkout', '-q', '-b', 'main']);
  repo.commit(first, { 'README.md': 'fake repository\n' }, 'first commit');
  git(first, ['push', '-q', 'origin', 'main']);
  return repo;
}

function openBareRepo(root: string, bare: string): BareRepo {
  let n = 0;

  const clone = (): string => {
    const dir = join(root, `clone-${++n}`);
    git(root, ['clone', '-q', bare, dir]);
    return dir;
  };
  const commit = (dir: string, files: Record<string, string>, message: string): string => {
    for (const [rel, content] of Object.entries(files)) {
      const full = join(dir, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', message]);
    return git(dir, ['rev-parse', 'HEAD']).trim();
  };

  return {
    bare,
    clone,
    commit,
    branch: (dir, name) => void git(dir, ['checkout', '-q', '-b', name]),
    push: (dir, branch) => void git(dir, ['push', '-q', '-u', 'origin', branch]),
    sha: (branch) => git(bare, ['rev-parse', `refs/heads/${branch}`]).trim(),
    show: (branch, path) => git(bare, ['show', `refs/heads/${branch}:${path}`]),
    copy() {
      const target = newRoot();
      cpSync(bare, target.bare, { recursive: true });
      return openBareRepo(target.root, target.bare);
    },
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}
