#!/usr/bin/env node
// Runs one real-machine oracle of the local-name goals (goals/retired/local-name.json, retired by ADR 0006) from any worktree.
//
//   node scripts/local-name-goal-run.mjs check [<local-name-check args>]   the check tool, with the .env of the main checkout
//   node scripts/local-name-goal-run.mjs e2e                                the real e2e (tests/e2e/local-name-real.spec.ts)
//
// The real values (console name, sign-in) live in the .env of the main checkout, which a worktree does not have.
// `check` runs scripts/local-name-check.mjs with the main checkout as the current folder, so it reads that .env.
// `e2e` passes LOOPS_PUBLIC_URL, LOOPS_USERNAME and LOOPS_PASSWORD from that .env to Playwright, with LC_LOCAL_NAME=1.
// Nothing here prints a value of that .env. The output and the exit code are those of the program that it runs.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' });
if (common.status !== 0) {
  console.error('local-name-goal-run: cannot find the main checkout (git rev-parse failed)');
  process.exit(2);
}
const main = dirname(common.stdout.trim());

function mainEnv() {
  const env = {};
  for (const line of readFileSync(resolve(main, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

const [mode, ...rest] = process.argv.slice(2);
let r;
if (mode === 'check') {
  r = spawnSync(process.execPath, [resolve(root, 'scripts/local-name-check.mjs'), ...rest], { cwd: main, stdio: 'inherit' });
} else if (mode === 'e2e') {
  const env = mainEnv();
  for (const k of ['LOOPS_PUBLIC_URL', 'LOOPS_USERNAME', 'LOOPS_PASSWORD']) {
    if (!env[k]) {
      console.error(`local-name-goal-run: ${k} is missing in the .env of the main checkout`);
      process.exit(2);
    }
  }
  r = spawnSync('npx playwright test tests/e2e/local-name-real.spec.ts --project=chromium', {
    cwd: root,
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, LC_LOCAL_NAME: '1', LOOPS_PUBLIC_URL: env.LOOPS_PUBLIC_URL, LOOPS_USERNAME: env.LOOPS_USERNAME, LOOPS_PASSWORD: env.LOOPS_PASSWORD },
  });
} else {
  console.error('usage: node scripts/local-name-goal-run.mjs check [args] | e2e');
  process.exit(2);
}
process.exit(r.status ?? 1);
