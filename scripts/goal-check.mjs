#!/usr/bin/env node
// Proves the goals of a plan again with one command (task U26 of epic castraferrum#63).
//
//   node scripts/goal-check.mjs <manifest> [--only G<k>]
//
// The manifest is { "setup": ["<cmd>", ...], "goals": [{ "id", "outcome", "checks": [<check>, ...] }] }.
// A check is { "run": "<cmd>", "exit"?: 0, "expect"?: ["<text>"], "empty"?: true, "maxStdoutBytes"?: n }
// or { "file": "<path>", "contains": "<text>" }. Every command runs through the shell from the repository root.
// The script prints one line per goal (`G<k> pass` or `G<k> FAIL: ...` with the first 20 lines of the failing
// output, and its last 20 when it is longer), then `goals passed: p/n`, and exits 0 only when p equals n. It never stops at the first failure.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LINES = 20;

function run(cmd) {
  process.stderr.write(`goal-check: running ${cmd}\n`);
  const started = Date.now();
  const r = spawnSync(cmd, { cwd: root, shell: true, maxBuffer: 1024 * 1024 * 1024 });
  const stdout = r.stdout ?? Buffer.alloc(0);
  const stderr = r.stderr ?? Buffer.alloc(0);
  const seconds = Math.round((Date.now() - started) / 1000);
  process.stderr.write(`goal-check: exit ${r.status} after ${seconds}s\n`);
  return {
    code: r.error ? `error ${r.error.message}` : r.status,
    stdoutBytes: stdout.length,
    stdout: stdout.toString('utf8'),
    all: `${stdout.toString('utf8')}\n${stderr.toString('utf8')}`,
  };
}

// Returns null when the check passes, else { what, output }.
function check(c) {
  if (typeof c.file === 'string') {
    const label = `file ${c.file}`;
    const path = resolve(root, c.file);
    if (!existsSync(path)) return { what: `${label}: the file does not exist`, output: '' };
    if (typeof c.contains === 'string' && !readFileSync(path, 'utf8').includes(c.contains)) {
      return { what: `${label}: does not contain "${c.contains}"`, output: '' };
    }
    return null;
  }
  if (typeof c.run !== 'string') return { what: `invalid check ${JSON.stringify(c)}`, output: '' };
  const label = `run \`${c.run}\``;
  const r = run(c.run);
  const problems = [];
  const wanted = c.exit ?? 0;
  if (r.code !== wanted) problems.push(`exit ${r.code}, expected ${wanted}`);
  for (const text of c.expect ?? []) if (!r.all.includes(text)) problems.push(`missing "${text}"`);
  if (c.empty === true && r.stdoutBytes > 0) problems.push(`stdout not empty (${r.stdoutBytes} bytes)`);
  if (typeof c.maxStdoutBytes === 'number' && r.stdoutBytes > c.maxStdoutBytes) {
    problems.push(`stdout is ${r.stdoutBytes} bytes, more than ${c.maxStdoutBytes}`);
  }
  if (problems.length === 0) return null;
  // For a size failure the output itself is not useful (binary archives), so show its size only.
  const output = typeof c.maxStdoutBytes === 'number' && r.stdoutBytes > c.maxStdoutBytes ? '' : r.all;
  return { what: `${label}: ${problems.join('; ')}`, output };
}

// The first 20 lines of the failing output; for a longer output also its last 20 lines, where a long command such as
// `npm run verify` says which step failed.
function excerpt(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const shown =
    lines.length <= 2 * MAX_LINES
      ? lines
      : [...lines.slice(0, MAX_LINES), `... (${lines.length - 2 * MAX_LINES} lines left out)`, ...lines.slice(-MAX_LINES)];
  return shown.map((l) => `    ${l}`).join('\n');
}

export function main(argv) {
  const args = argv.slice(2);
  const manifestPath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--only');
  const onlyAt = args.indexOf('--only');
  const only = onlyAt >= 0 ? args[onlyAt + 1] : undefined;
  if (!manifestPath) {
    console.error('usage: node scripts/goal-check.mjs <manifest> [--only G<k>]');
    return 2;
  }
  const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
  const goals = (manifest.goals ?? []).filter((g) => !only || g.id === only);
  if (goals.length === 0) {
    console.error(`no goal${only ? ` ${only}` : ''} in ${manifestPath}`);
    return 2;
  }

  let setupFailure = null;
  for (const cmd of manifest.setup ?? []) {
    const r = run(cmd);
    if (r.code !== 0) {
      setupFailure = { what: `setup \`${cmd}\`: exit ${r.code}`, output: r.all };
      break;
    }
  }

  let passed = 0;
  for (const goal of goals) {
    let failure = setupFailure;
    if (!failure) {
      for (const c of goal.checks ?? []) {
        failure = check(c);
        if (failure) break;
      }
    }
    if (failure) {
      console.log(`${goal.id} FAIL: ${failure.what}`);
      const lines = excerpt(failure.output);
      if (lines) console.log(lines);
    } else {
      passed += 1;
      console.log(`${goal.id} pass`);
    }
  }
  console.log(`goals passed: ${passed}/${goals.length}`);
  return passed === goals.length ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}
