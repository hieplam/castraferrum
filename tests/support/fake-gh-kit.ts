// Fake GitHub for tests (F2). A `gh` look-alike that keeps all state in one JSON file, so an oracle can run
// against "GitHub" with no network, no token and no real repository. Users: K3, K4, K9, K11, R3.
//
// HOW TO SEED THE WORLD
//   const bare = createBareRepo();         // optional: a real local origin (tests/support/bare-repo.ts)
//   const gh = createFakeGh(bare);         // { bin, script, world, env, read(), dispose() }
//   Seed by writing the world file BEFORE the code under test runs:
//     const w = gh.read();                 // parsed world
//     w.issues.push({ number: 1, title: 'T', body: 'B', state: 'OPEN', labels: [{ name: 'x' }], comments: [], ... });
//     w.labels.push('x');                  // or gh.seedLabels('x'): a label that an issue uses must exist
//     w.checkRuns[sha] = [{ name: 'ci', status: 'completed', conclusion: 'success' }];  // keyed by commit sha
//     writeFileSync(gh.world, JSON.stringify(w));
//   Issues and pull requests share one number sequence (as on GitHub): the next number is max(all)+1.
//
// HOW TO READ THE WORLD
//   gh.read().issues | prs | statuses[sha] | checkRuns[sha] | calls
//   `calls` is the call log: { args: string[], exit: number }, one entry per call, a failed call too
//   (exit 1 = merge refused, 64 = unsupported command). Check it to prove what the code under test did.
//   After a merge, read the real result with `bare.sha('main')` and `bare.show('main', 'path')`.
//
// HOW TO CALL IT (two ways; both are supported)
//   1. With a shell: `gh.bin` is a `gh.cmd` (win32) or a `gh` shell wrapper. Put `gh.env` in the child
//      environment (`LOOPS_GH_BIN` = the wrapper, `FAKE_GH_WORLD` = the world file). Node cannot spawn a
//      `.cmd` with no shell, so on win32 pass `shell: true`.
//   2. With NO shell: run the script itself, `[process.execPath, gh.script, ...args]`, with `gh.env` in the
//      environment. `gh.script` is `tests/support/fake-gh.mjs`. A caller that uses no shell (the `GitHost` of
//      K3, when `LOOPS_GH_BIN` ends in `.mjs`) uses this way.
//
// Supported commands are listed in the header of `fake-gh.mjs`. Any other command exits 64.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BareRepo } from './bare-repo.ts';

export interface FakeIssue {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED';
  labels: { name: string }[];
  /** `authorAssociation` is the field of `gh issue list --json comments`; a comment with none is read as a stranger's. */
  comments: { id: string; createdAt: string; body: string; authorAssociation?: string }[];
  /** Who opened the issue. `issue create` sets the owner part of `-R`. */
  author?: { login: string };
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}
export interface FakePr {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'MERGED';
  headRefName: string;
  baseRefName: string;
  headRefOid: string;
  /** True when the head branch lives in a fork. `pick` gives `false` when it is not set. */
  isCrossRepository?: boolean;
  mergeCommit: { oid: string } | null;
  /** The issues that the body closes; `pr create` fills it from "Closes #n". */
  closingIssuesReferences?: { number: number }[];
  url: string;
  createdAt: string;
  mergedAt: string | null;
}
export interface FakeStatus {
  state: string;
  context: string;
  description: string;
  created_at: string;
}
export interface FakeWorld {
  bare: string | null;
  issues: FakeIssue[];
  /** The names of the labels that the repository has. `issue create --label` refuses any other name. */
  labels: string[];
  prs: FakePr[];
  statuses: Record<string, FakeStatus[]>;
  checkRuns: Record<string, Record<string, unknown>[]>;
  /** The numbers of the sub-issues of each parent. */
  subIssues: Record<string, number[]>;
  calls: { args: string[]; exit: number }[];
  /** `<group> <sub>` texts, for example `pr create`. The next such call exits 1, and its text leaves the list. */
  failNext?: string[];
}
export interface FakeGh {
  /** The wrapper: `gh.cmd` on win32, a `gh` shell script elsewhere. */
  bin: string;
  /** The script itself, for a caller that uses no shell. */
  script: string;
  /** The world file (`FAKE_GH_WORLD`). */
  world: string;
  /** `LOOPS_GH_BIN` and `FAKE_GH_WORLD`, ready to merge into a child environment. */
  env: { LOOPS_GH_BIN: string; FAKE_GH_WORLD: string };
  read(): FakeWorld;
  /** Adds labels to the repository, as `gh label create` does. */
  seedLabels(...names: string[]): void;
  dispose(): void;
}

export const FAKE_GH_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'fake-gh.mjs');

export function createFakeGh(bare?: BareRepo): FakeGh {
  const dir = mkdtempSync(join(tmpdir(), 'lc-fake-gh-'));
  const world = join(dir, 'world.json');
  const empty: FakeWorld = { bare: bare?.bare ?? null, issues: [], labels: [], prs: [], statuses: {}, checkRuns: {}, subIssues: {}, calls: [] };
  writeFileSync(world, JSON.stringify(empty, null, 2));

  let bin: string;
  if (process.platform === 'win32') {
    bin = join(dir, 'gh.cmd');
    writeFileSync(bin, `@echo off\r\n"${process.execPath}" "${FAKE_GH_SCRIPT}" %*\r\n`);
  } else {
    bin = join(dir, 'gh');
    writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_GH_SCRIPT}" "$@"\n`);
    chmodSync(bin, 0o755);
  }
  return {
    bin,
    script: FAKE_GH_SCRIPT,
    world,
    env: { LOOPS_GH_BIN: bin, FAKE_GH_WORLD: world },
    read: () => JSON.parse(readFileSync(world, 'utf8')) as FakeWorld,
    seedLabels: (...names) => {
      const w = JSON.parse(readFileSync(world, 'utf8')) as FakeWorld;
      for (const n of names) if (!w.labels.includes(n)) w.labels.push(n);
      writeFileSync(world, JSON.stringify(w, null, 2));
    },
    dispose: () => rmSync(dir, { recursive: true, force: true }),
  };
}
