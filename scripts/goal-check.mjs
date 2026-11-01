#!/usr/bin/env node
// Proves the goals of a plan again with one command (task U26 of epic castraferrum#63).
//
//   node scripts/goal-check.mjs <manifest> [--only G<k>] [--cadence merge|nightly] [--json]
//
// The manifest is { "setup": ["<cmd>", ...], "goals": [{ "id", "outcome", "checks": [<check>, ...], "cadence"?, "d7"? }] }.
// A check is { "run": "<cmd>", "exit"?: 0, "expect"?: ["<text>"], "empty"?: true, "maxStdoutBytes"?: n, "score"?: "<regex>" }
// or { "file": "<path>", "contains": "<text>" }.
// "score" is a regex with two number groups. Its first match on the output of the check gives the goal a value and
// an "of" (`72/240 screens`). No match fails the goal. A goal has "cadence": "merge" (the default) or "nightly";
// `--cadence <name>` runs only the goals of that cadence. A goal with "d7": true passes when its checks pass and
// prints "not measured yet". With `--json`, stdout is one line
// {"goals":[{"id","pass","value","of","line"}],"passed","total","sha"} and the exit code stays.
// A run with no manifest, an unknown cadence, or no goal to run prints a message on stderr and exits 2. Every command runs through the shell from the repository root.
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

// Returns { failure, score }. failure is null when the check passes, else { what, output }. score is null or { value, of, text }.
function check(c) {
  if (typeof c.file === 'string') {
    const label = `file ${c.file}`;
    const path = resolve(root, c.file);
    if (!existsSync(path)) return { failure: { what: `${label}: the file does not exist`, output: '' }, score: null };
    if (typeof c.contains === 'string' && !readFileSync(path, 'utf8').includes(c.contains)) {
      return { failure: { what: `${label}: does not contain "${c.contains}"`, output: '' }, score: null };
    }
    return { failure: null, score: null };
  }
  if (typeof c.run !== 'string') return { failure: { what: `invalid check ${JSON.stringify(c)}`, output: '' }, score: null };
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
  let score = null;
  if (typeof c.score === 'string') {
    const m = new RegExp(c.score).exec(r.all);
    if (m) score = { value: Number(m[1]), of: Number(m[2]), text: m[0] };
    else problems.push(`score: no match for /${c.score}/`);
  }
  if (problems.length === 0) return { failure: null, score };
  // For a size failure the output itself is not useful (binary archives), so show its size only.
  const output = typeof c.maxStdoutBytes === 'number' && r.stdoutBytes > c.maxStdoutBytes ? '' : r.all;
  return { failure: { what: `${label}: ${problems.join('; ')}`, output }, score };
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

function sha() {
  const r = spawnSync('git rev-parse --short=7 HEAD', { cwd: root, shell: true, encoding: 'utf8' });
  const out = (r.stdout ?? '').trim();
  return r.status === 0 && out ? out : 'unknown';
}

const USAGE = 'usage: node scripts/goal-check.mjs <manifest> [--only G<k>] [--cadence merge|nightly] [--json]';
const CADENCES = ['merge', 'nightly'];

export function main(argv) {
  const args = argv.slice(2);
  const valueOf = (flag) => {
    const at = args.indexOf(flag);
    return at >= 0 ? (args[at + 1] ?? '') : undefined;
  };
  const only = valueOf('--only');
  const cadence = valueOf('--cadence');
  const json = args.includes('--json');
  const manifestPath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--only' && args[i - 1] !== '--cadence');
  if (!manifestPath) {
    console.error(USAGE);
    return 2;
  }
  if (cadence !== undefined && !CADENCES.includes(cadence)) {
    console.error(`unknown cadence "${cadence}", use merge or nightly`);
    return 2;
  }
  const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
  const goals = (manifest.goals ?? [])
    .filter((g) => !only || g.id === only)
    .filter((g) => cadence === undefined || (g.cadence ?? 'merge') === cadence);
  if (goals.length === 0) {
    console.error(`no goal${only ? ` ${only}` : ''}${cadence ? ` with cadence ${cadence}` : ''} in ${manifestPath}`);
    return 2;
  }
  // In --json mode stdout holds one line only, so the human text goes to stderr.
  const say = json ? (t) => console.error(t) : (t) => console.log(t);

  let setupFailure = null;
  for (const cmd of manifest.setup ?? []) {
    const r = run(cmd);
    if (r.code !== 0) {
      setupFailure = { what: `setup \`${cmd}\`: exit ${r.code}`, output: r.all };
      break;
    }
  }

  let passed = 0;
  const rows = [];
  for (const goal of goals) {
    let failure = setupFailure;
    let score = null;
    if (!failure) {
      for (const c of goal.checks ?? []) {
        const r = check(c);
        score ??= r.score;
        failure = r.failure;
        if (failure) break;
      }
    }
    const row = { id: goal.id, pass: !failure, value: score?.value ?? null, of: score?.of ?? null, line: '' };
    if (failure) {
      row.line = score ? `${goal.id} ${score.text}` : `${goal.id} FAIL`;
      say(`${goal.id} FAIL: ${failure.what}`);
      const lines = excerpt(failure.output);
      if (lines) say(lines);
      if (score) say(`    score ${score.text}`);
    } else {
      passed += 1;
      const note = goal.d7 === true ? 'not measured yet' : score?.text;
      row.line = goal.d7 === true ? `${goal.id} pass (not measured yet)` : score ? `${goal.id} ${score.text}` : `${goal.id} pass`;
      say(note ? `${goal.id} pass (${note})` : `${goal.id} pass`);
    }
    if (goal.d7 === true) row.d7 = true;
    rows.push(row);
  }
  say(`goals passed: ${passed}/${goals.length}`);
  if (json) console.log(JSON.stringify({ goals: rows, passed, total: goals.length, sha: sha() }));
  return passed === goals.length ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}
