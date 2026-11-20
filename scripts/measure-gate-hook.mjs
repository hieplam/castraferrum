// Measures the time of the beforeEach hook of server/adapters/git/git-gate-workspace.test.ts (issue 514).
// "before" builds a repository from scratch in each hook; "after" copies one seeded repository.
// Usage: node scripts/measure-gate-hook.mjs [runs]   Prints the slowest and the mean hook time in ms for both.
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createBareRepo } from '../tests/support/bare-repo.ts';

const runs = Number(process.argv[2] ?? 5);
const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: 'ignore' });

function before() {
  const bare = createBareRepo();
  const dev = bare.clone();
  git(dev, ['checkout', '-q', 'main']);
  bare.clone();
  bare.dispose();
}

const seed = createBareRepo();
function after() {
  const bare = seed.copy();
  bare.clone();
  bare.clone();
  bare.dispose();
}

function time(fn) {
  const t = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return { max: Math.round(Math.max(...t)), mean: Math.round(t.reduce((a, b) => a + b, 0) / t.length) };
}

const b = time(before);
const a = time(after);
seed.dispose();
console.log(JSON.stringify({ runs, beforeMs: b, afterMs: a }));
