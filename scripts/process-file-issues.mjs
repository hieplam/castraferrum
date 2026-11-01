#!/usr/bin/env node
// Files one GitHub issue for each process-review cluster of 2 or more events (spec 2.12, goal G14).
// No model runs here. The cluster key is `cluster.fingerprint` (12 hex characters, spec 2.11), made by the review writer.
//   node scripts/process-file-issues.mjs <review-file> [--dry-run]
// gh is `LOOPS_GH_BIN` or `gh`; a `.mjs` value runs with node. Every cluster is checked before the first gh call.
// Exit 0: done. Exit 2: usage, or a review file or cluster that is not valid (nothing was written). Exit 1: a gh call failed.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const USAGE = 'usage: process-file-issues.mjs <file> [--dry-run]';
const FINGERPRINT = /^[0-9a-f]{12}$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;

function fail(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const file = argv.find((a) => !a.startsWith('--'));
if (!file) fail(USAGE);

let review;
try {
  review = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  fail(`process-file-issues: cannot read ${file}: ${e.message}`);
}
if (review?.v !== 1 || !Array.isArray(review.clusters)) fail('process-file-issues: the file needs "v": 1 and a "clusters" array');

const text = (x) => typeof x === 'string' && x.trim() !== '';
const problems = [];
review.clusters.forEach((c, i) => {
  const bad = [];
  if (!text(c?.id)) bad.push('id');
  if (!text(c?.cause)) bad.push('cause');
  if (!Number.isInteger(c?.events) || c.events < 0) bad.push('events');
  if (!REPO.test(c?.repo ?? '')) bad.push('repo');
  if (!FINGERPRINT.test(c?.fingerprint ?? '')) bad.push('fingerprint (12 hex characters)');
  if (bad.length) problems.push(`cluster ${i + 1} (${c?.id ?? 'no id'}): invalid ${bad.join(', ')}`);
});
if (problems.length) fail(`process-file-issues: ${problems.join('; ')}. Nothing was written.`);

const ghBin = process.env.LOOPS_GH_BIN || 'gh';
function gh(args) {
  const [cmd, cmdArgs] = ghBin.endsWith('.mjs') ? [process.execPath, [ghBin, ...args]] : [ghBin, args];
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8' });
  if (r.error || r.status !== 0) fail(`process-file-issues: gh ${args.slice(0, 2).join(' ')} failed: ${r.error?.message ?? r.stderr}`, 1);
  return r.stdout;
}

function issueBody(c) {
  const check = c.check ?? {};
  return [
    `<!-- fingerprint:${c.fingerprint} -->`,
    '',
    `Cause: ${c.cause}`,
    `Events: ${c.events}`,
    `Period: ${c.firstAt} to ${c.lastAt}`,
    `Check kind: ${check.kind ?? 'not set'}`,
    `Check name: ${check.name ?? 'not set'}`,
    `Replay: ${check.replay ?? 'not set'}`,
    '',
  ].join('\n');
}

const result = { created: [], updated: [], skipped: [] };
for (const c of review.clusters) {
  if (c.events < 2) {
    result.skipped.push(c.fingerprint);
    continue;
  }
  const found = JSON.parse(gh(['issue', 'list', '-R', c.repo, '--state', 'all', '--search', `"${c.fingerprint}" in:body`, '--json', 'number,state']));
  if (found.length === 0) {
    result.created.push(c.fingerprint);
    if (dryRun) continue;
    const dir = mkdtempSync(join(tmpdir(), 'lc-process-issue-'));
    try {
      const bodyFile = join(dir, 'body.md');
      writeFileSync(bodyFile, issueBody(c));
      gh(['issue', 'create', '-R', c.repo, '--title', `process-review: ${c.cause}`, '--body-file', bodyFile]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    continue;
  }
  // An open issue wins. Otherwise reopen the newest closed one.
  const open = found.filter((x) => String(x.state).toUpperCase() === 'OPEN').sort((a, b) => a.number - b.number)[0];
  const target = open ?? [...found].sort((a, b) => b.number - a.number)[0];
  result.updated.push(c.fingerprint);
  if (dryRun) continue;
  if (!open) gh(['issue', 'reopen', String(target.number), '-R', c.repo]);
  gh(['issue', 'comment', String(target.number), '-R', c.repo, '--body', `process-review: ${c.events} events again, last at ${c.lastAt}`]);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
