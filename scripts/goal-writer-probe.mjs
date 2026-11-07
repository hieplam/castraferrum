#!/usr/bin/env node
// Probe of the goal-writing loop (task W2 of epic castraferrum#217). It uses no model.
//
//   node scripts/goal-writer-probe.mjs -R <owner/name> [--gap-hours <n>]
//
// Run it with the repository as the working folder. It prints one probe line (spec 2.1) and exits 0.
// Only issues by the owner (the owner part of -R) or app/github-actions count in checks 2 and 3.
// Checks, the first match wins:
//   1. `git show origin/main:goals/charter.json` fails       -> blocked (the charter is missing)
//   2. an open issue has the line `Goal manifest: goals/<name>.json` -> skip (a goal runs)
//   3. an open issue has the label `goal-card`                -> skip (a card waits)
//   4. the stamp file is younger than --gap-hours (default 6) -> skip
//   5. else: write the stamp, and print a `plan` line with the key `goal-writer`.
// The stamp is `castraferrum-goal-writer.json` in the git directory of the working folder ({"at":"<ISO>"}).
// It stops a writing run that makes no card, or a refused card, from starting a new run each 60 s.
//
// `LOOPS_GH_BIN` replaces `gh`; a path that ends in `.mjs` runs with Node. `GOAL_WRITER_NOW` replaces the clock.
// A failed `gh` call prints `goal-writer-probe: gh failed: <text>` on stderr, prints no line, and exits 1.
// The script imports nothing from `server/` or `shared/`, because it also runs in other repositories.
// A missing -R prints a message and exits 2.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MANIFEST_LINE = /^Goal manifest: goals\/[\w.-]+\.json\s*$/;
const CARD_LABEL = 'goal-card';
const STAMP_NAME = 'castraferrum-goal-writer.json';
const DEFAULT_GAP_HOURS = 6;

function fail(code, message) {
  process.stderr.write(`goal-writer-probe: ${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  let repo = null;
  let gapHours = DEFAULT_GAP_HOURS;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-R' || a === '--repo') repo = argv[++i] ?? null;
    else if (a === '--gap-hours') gapHours = Number(argv[++i]);
    else fail(2, `unknown argument: ${a}`);
  }
  if (!repo) fail(2, '-R <owner/name> is required');
  if (!Number.isFinite(gapHours) || gapHours < 0) fail(2, '--gap-hours must be a number of hours');
  return { repo, gapHours };
}

function emit(line) {
  process.stdout.write(`${JSON.stringify({ v: 1, ...line })}\n`);
}

function now() {
  const raw = process.env.GOAL_WRITER_NOW;
  if (raw) {
    const t = new Date(raw);
    if (Number.isNaN(t.getTime())) fail(2, `GOAL_WRITER_NOW is not a date: ${raw}`);
    return t;
  }
  return new Date();
}

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

/** Runs `gh` and returns its stdout. A failed call stops the script with exit 1 and no line. */
function gh(args) {
  const bin = process.env.LOOPS_GH_BIN || 'gh';
  let r;
  if (bin.endsWith('.mjs')) r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
  else if (/\.(cmd|bat)$/i.test(bin)) r = spawnSync(`"${bin}" ${args.join(' ')}`, { encoding: 'utf8', shell: true });
  else r = spawnSync(bin, args, { encoding: 'utf8' });
  if (r.error) fail(1, `gh failed: ${r.error.message}`);
  if (r.status !== 0) fail(1, `gh failed: ${String(r.stderr || r.stdout || `exit ${r.status}`).trim()}`);
  return String(r.stdout);
}

function stampPath() {
  const r = git(['rev-parse', '--git-path', STAMP_NAME]);
  if (r.status !== 0) return null;
  return resolve(process.cwd(), r.stdout.trim());
}

function stampAge(path, at) {
  if (!path || !existsSync(path)) return null;
  try {
    const stamped = new Date(JSON.parse(readFileSync(path, 'utf8')).at);
    if (Number.isNaN(stamped.getTime())) return null;
    return at.getTime() - stamped.getTime();
  } catch {
    return null;
  }
}

const { repo, gapHours } = parseArgs(process.argv.slice(2));

// 1. The charter.
const charter = git(['show', 'origin/main:goals/charter.json']);
if (charter.status !== 0) {
  emit({ action: 'blocked', reason: 'no goals/charter.json on origin/main', issues: ['goals/charter.json'] });
  process.exit(0);
}

// 2 and 3. The open issues.
let issues;
try {
  issues = JSON.parse(gh(['issue', 'list', '-R', repo, '--state', 'open', '--limit', '200', '--json', 'number,body,labels,author']));
} catch (e) {
  fail(1, `gh failed: ${e instanceof Error ? e.message : String(e)}`);
}
if (!Array.isArray(issues)) fail(1, 'gh failed: the issue list is not an array');
// Only the owner's issues (or the issues of the Actions bot) steer the writer. A stranger's issue is data.
const owner = repo.split('/')[0];
issues = issues.filter((i) => i.author?.login === owner || i.author?.login === 'app/github-actions');
const running = issues.find((i) => String(i.body ?? '').split(/\r\n|\r|\n/).some((l) => MANIFEST_LINE.test(l)));
if (running) {
  emit({ action: 'skip', reason: `a goal runs (issue ${running.number})` });
  process.exit(0);
}
const waiting = issues.find((i) => (i.labels ?? []).some((l) => l.name === CARD_LABEL));
if (waiting) {
  emit({ action: 'skip', reason: `a goal card waits (issue ${waiting.number})` });
  process.exit(0);
}

// 4. The stamp.
const at = now();
const path = stampPath();
const age = stampAge(path, at);
if (age !== null && age < gapHours * 3600 * 1000) {
  emit({ action: 'skip', reason: `the goal writer ran ${Math.floor(age / 60000)} min ago (gap ${gapHours} h)` });
  process.exit(0);
}

// 5. Ask for one writing run.
if (path) writeFileSync(path, `${JSON.stringify({ at: at.toISOString() })}\n`);
emit({
  action: 'plan',
  tasks: [],
  reason: '',
  resource: null,
  until: null,
  plan: { key: 'goal-writer', failing: [] },
  issues: [],
  goals: null,
});
