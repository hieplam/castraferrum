#!/usr/bin/env node
// Merge audit (spec 2.15, goal G6): the second layer of the gate guard. The hook stops a merge that is typed as a
// command. A merge hidden in a script file passes the hook, and only this audit finds it.
//   node scripts/merge-audit.mjs -R <owner/name> --since <ISO date> [--json]
// For each PR merged at or after --since, it reads the `castraferrum/gate` status of the PR head commit. A PR with
// no such status, or with a state other than `success`, is an incident. It writes nothing to GitHub.
// A success status whose description is `gate: ratified <ISO time>` is a ratified merge (decision 41). The audit lists it
// (`ratified: PR <n> <time>`, and the key `ratified` in --json). It is not an incident, and it does not change the exit code.
// `--since` is required, because older PRs have no gate status.
// `LOOPS_GH_BIN` names the gh program (a path that ends in `.mjs` runs as a script of the current Node), else `gh`.
// Exit 0: no incident. Exit 1: one or more incidents. Exit 2: a bad argument, or any failed `gh` call.
// A failed `gh` call never prints "0 incidents": a false all-clear is the worst result of this tool.
import { spawnSync } from 'node:child_process';

const GATE_CONTEXT = 'castraferrum/gate';
const LIMIT = 1000;
const RATIFIED = /^gate: ratified (\S+)$/;

function fail(message) {
  process.stderr.write(`merge-audit: ${message}\n`);
  process.exit(2);
}

function parseArgs(list) {
  const opts = { repo: undefined, since: undefined, json: false };
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const value = () => {
      const v = list[++i];
      if (v === undefined || v.startsWith('-')) fail(`${a} needs a value`);
      return v;
    };
    if (a === '-R' || a === '--repo') opts.repo = value();
    else if (a === '--since') opts.since = value();
    else if (a === '--json') opts.json = true;
    else fail(`unknown argument ${a}`);
  }
  if (opts.repo === undefined) fail('-R <owner/name> is required');
  if (!/^[\w.-]+\/[\w.-]+$/.test(opts.repo)) fail(`-R ${opts.repo} is not <owner>/<name>`);
  if (opts.since === undefined) fail('--since <ISO date> is required');
  const sinceMs = Date.parse(opts.since);
  if (Number.isNaN(sinceMs)) fail(`--since ${opts.since} is not a date`);
  return { ...opts, sinceMs };
}

function gh(args) {
  const bin = process.env.LOOPS_GH_BIN || 'gh';
  const isScript = bin.endsWith('.mjs');
  const [cmd, argv] = isScript ? [process.execPath, [bin, ...args]] : [bin, args];
  const shell = !isScript && process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
  const r = spawnSync(cmd, argv, { encoding: 'utf8', shell, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) fail(`cannot run ${bin}: ${r.error.message}`);
  if (r.status !== 0) fail(`gh ${args.slice(0, 2).join(' ')} failed (exit ${r.status}): ${(r.stderr || '').trim()}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    fail(`gh ${args.slice(0, 2).join(' ')} printed output that is not JSON`);
  }
}

const opts = parseArgs(process.argv.slice(2));

const listed = gh(['pr', 'list', '-R', opts.repo, '--state', 'merged', '--limit', String(LIMIT), '--json', 'number,headRefOid,mergedAt']);
if (!Array.isArray(listed)) fail('gh pr list did not print a list');
// A full page can hide older merges: refuse to claim "all clear" on a truncated list.
if (listed.length >= LIMIT) fail(`gh pr list returned ${LIMIT} PRs, the list may be cut off; use a later --since`);

const merged = listed.filter((p) => p && p.mergedAt && Date.parse(p.mergedAt) >= opts.sinceMs);
const incidents = [];
const ratified = [];
for (const pr of merged) {
  if (typeof pr.headRefOid !== 'string' || !pr.headRefOid) fail(`PR ${pr.number} has no head commit`);
  const status = gh(['api', `repos/${opts.repo}/commits/${pr.headRefOid}/status`]);
  if (!status || !Array.isArray(status.statuses)) fail(`status of PR ${pr.number} has an unexpected shape`);
  const gate = status.statuses.find((s) => s.context === GATE_CONTEXT);
  if (!gate) incidents.push({ pr: pr.number, sha: pr.headRefOid, why: 'no status' });
  else if (gate.state !== 'success') incidents.push({ pr: pr.number, sha: pr.headRefOid, why: `status ${gate.state}` });
  else {
    const match = RATIFIED.exec(typeof gate.description === 'string' ? gate.description : '');
    if (match) ratified.push({ pr: pr.number, at: match[1] });
  }
}

if (opts.json) {
  process.stdout.write(`${JSON.stringify({ incidents, ratified, merged: merged.length })}\n`);
} else {
  for (const i of incidents) process.stdout.write(`incident: PR ${i.pr} ${i.sha.slice(0, 7)} ${i.why}\n`);
  for (const x of ratified) process.stdout.write(`ratified: PR ${x.pr} ${x.at}\n`);
  process.stdout.write(`merge-audit: ${incidents.length} incidents in ${merged.length} merged PRs\n`);
}
process.exitCode = incidents.length ? 1 : 0;
