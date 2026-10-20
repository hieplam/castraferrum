#!/usr/bin/env node
// Driver for the extraction loop (epic #4): each round takes exactly ONE task issue, hands it to one subagent,
// then checks by machine that the task is really done. State lives on GitHub (labels, comments, blocked-by links),
// never in the coordinating session's memory, so a new session can pick up where the last one stopped.
//
//   node tools/extraction-loop/loop.mjs status                 # table of every task: done / in progress / needs human / blocked / ready
//   node tools/extraction-loop/loop.mjs next                   # JSON of the next ready task (or {"next":null,...})
//   node tools/extraction-loop/loop.mjs claim <N>              # label loop:in-progress + comment the ratchet baseline (loop-baseline:)
//   node tools/extraction-loop/loop.mjs brief <N>              # print the subagent prompt (brief.md with the issue filled in)
//   node tools/extraction-loop/loop.mjs check <N> [--dry-run]  # "really done?"; PASS -> remove label + comment; FAIL -> reasons, exit 1
//   node tools/extraction-loop/loop.mjs release <N> --reason "<why>" [--needs-human]
//                                                              # back to the queue, or loop:needs-human (also after MAX_ATTEMPTS)
//
// "Really done" (check) = all of:
//   1. the issue is CLOSED by a MERGED pull request in this repo (closedByPullRequestsReferences)
//   2. that PR's body has a "## Verify" section that mentions Red, Green and Stub
//   3. that PR's title and body contain no Vietnamese letters
//   4. on main (after pull) the evidence log has a heading "## T<k>" for the task
//   5. ratchet: the scanner's counts (vietnamese, coupling) are not above the loop-baseline recorded at claim
//
// Environment: CF_SOURCE_REPO = absolute path of the source repo checkout (needed while the console still lives
// there; the scanner is looked up in this repo first, then in <CF_SOURCE_REPO>/loop-console).
// Exit codes: 0 ok, 1 not ok, 2 bad usage.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'hieplam/castraferrum';
const EPIC = 4;
const L_WORK = 'loop:in-progress';
const L_HUMAN = 'loop:needs-human';
const MAX_ATTEMPTS = 2;
const EVIDENCE = 'docs/plans/2026-10-20-extraction-evidence.md';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
// Vietnamese letters with diacritics: Latin Extended Additional plus the Vietnamese letters of Latin-1, Ext-A, Ext-B.
const VI = /[\u1EA0-\u1EF9\u00C0-\u00C3\u00C8-\u00CA\u00CC\u00CD\u00D2-\u00D5\u00D9\u00DA\u00DD\u00E0-\u00E3\u00E8-\u00EA\u00EC\u00ED\u00F2-\u00F5\u00F9\u00FA\u00FD\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01A0\u01A1\u01AF\u01B0]/;
const args = process.argv.slice(2);

function gh(a) { return execFileSync('gh', a, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
function ghJson(a) { const s = gh(a); return s ? JSON.parse(s) : null; }
function opt(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
function comment(n, text) {
  const f = join(tmpdir(), `extraction-loop-${n}-${Date.now()}.md`);
  writeFileSync(f, text, 'utf8');
  gh(['issue', 'comment', String(n), '-R', REPO, '--body-file', f]);
}
function die(msg) { console.error(msg); process.exit(2); }

function children() {
  const subs = ghJson(['api', `repos/${REPO}/issues/${EPIC}/sub_issues`, '--paginate']) || [];
  return subs.map((s) => ({ number: s.number, title: s.title, state: s.state, labels: s.labels.map((l) => l.name) }));
}
function blockers(n) {
  return (ghJson(['api', `repos/${REPO}/issues/${n}/dependencies/blocked_by`]) || []).map((b) => ({ number: b.number, state: b.state }));
}
function taskOf(title) { const m = /^T(\d+)\b/.exec(title); return m ? Number(m[1]) : null; }

function classify() {
  return children().map((i) => {
    let group;
    if (i.state === 'closed') group = 'done';
    else if (i.labels.includes(L_HUMAN)) group = 'needs-human';
    else if (i.labels.includes(L_WORK)) group = 'in-progress';
    else group = blockers(i.number).some((b) => b.state === 'open') ? 'blocked' : 'ready';
    return { ...i, task: taskOf(i.title), group };
  }).sort((a, b) => (a.task ?? 99) - (b.task ?? 99) || a.number - b.number);
}

// The scanner lives in this repo after the import, in the source repo before it.
function scanner() {
  const own = join(ROOT, 'scripts', 'lang-scan.mjs');
  if (existsSync(own)) return { cwd: ROOT, script: own };
  const src = process.env.CF_SOURCE_REPO;
  if (src) {
    const cwd = join(src, 'loop-console');
    const script = join(cwd, 'scripts', 'lang-scan.mjs');
    if (existsSync(script)) return { cwd, script };
  }
  return null;
}
function counts() {
  const s = scanner();
  if (!s) return null;
  let out;
  try {
    out = execFileSync('node', [s.script, '--tree', '--coupling'], { cwd: s.cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) { out = String(e.stdout || ''); }
  const num = (k) => { const m = new RegExp(`^${k}: (\\d+)`, 'm').exec(out); return m ? Number(m[1]) : null; };
  return { vietnamese: num('vietnamese'), coupling: num('coupling'), where: s.cwd };
}

function cmdStatus() {
  const all = classify();
  for (const i of all) console.log(`#${String(i.number).padEnd(4)} ${i.group.padEnd(12)} ${i.title}`);
  const n = (g) => all.filter((i) => i.group === g).length;
  const c = counts();
  console.log(`\ndone ${n('done')} | in progress ${n('in-progress')} | ready ${n('ready')} | blocked ${n('blocked')} | needs human ${n('needs-human')}` +
    (c ? ` | vietnamese ${c.vietnamese}, coupling ${c.coupling}` : ' | scanner not available'));
}

function cmdNext() {
  const all = classify();
  const busy = all.find((i) => i.group === 'in-progress');
  if (busy) { console.log(JSON.stringify({ next: null, reason: `#${busy.number} is in progress` })); return; }
  const ready = all.filter((i) => i.group === 'ready');
  if (!ready.length) {
    const human = all.filter((i) => i.group === 'needs-human').map((i) => `#${i.number}`);
    console.log(JSON.stringify({ next: null, reason: human.length ? `only needs-human left: ${human.join(' ')}` : 'nothing left' }));
    return;
  }
  const i = ready[0];
  console.log(JSON.stringify({ next: i.number, task: `T${i.task}`, title: i.title }));
}

function issueComments(n) { return ghJson(['issue', 'view', String(n), '-R', REPO, '--json', 'comments']).comments.map((c) => c.body); }
function attempts(n) { return issueComments(n).filter((b) => b.startsWith('loop-baseline:')).length; }
function lastBaseline(n) {
  const b = issueComments(n).filter((x) => x.startsWith('loop-baseline:')).pop();
  if (!b) return null;
  const v = /vietnamese=(\d+)/.exec(b), c = /coupling=(\d+)/.exec(b);
  return { vietnamese: v ? Number(v[1]) : null, coupling: c ? Number(c[1]) : null };
}

function cmdClaim(n) {
  const i = classify().find((x) => x.number === n);
  if (!i) die(`#${n} is not a sub-issue of epic #${EPIC}`);
  if (i.group !== 'ready') { console.error(`#${n} is ${i.group}, not ready`); process.exit(1); }
  const c = counts();
  gh(['issue', 'edit', String(n), '-R', REPO, '--add-label', L_WORK]);
  comment(n, `loop-baseline: vietnamese=${c?.vietnamese ?? 'n/a'} coupling=${c?.coupling ?? 'n/a'}\n\n` +
    `Claimed by the extraction loop (attempt ${attempts(n) + 1} of ${MAX_ATTEMPTS}). ` +
    `The counts may only go down by the time \`check\` runs.`);
  console.log(`claimed #${n} (T${i.task}); baseline vietnamese=${c?.vietnamese ?? 'n/a'} coupling=${c?.coupling ?? 'n/a'}`);
}

function cmdBrief(n) {
  const i = classify().find((x) => x.number === n);
  if (!i) die(`#${n} is not a sub-issue of epic #${EPIC}`);
  const src = process.env.CF_SOURCE_REPO || '<set CF_SOURCE_REPO>';
  const t = readFileSync(join(HERE, 'brief.md'), 'utf8');
  process.stdout.write(t.replaceAll('{{N}}', String(n)).replaceAll('{{T}}', `T${i.task}`).replaceAll('{{TITLE}}', i.title)
    .replaceAll('{{SOURCE}}', src).replaceAll('{{ROOT}}', ROOT).replaceAll('{{EPIC}}', String(EPIC)));
}

function cmdCheck(n) {
  const dry = args.includes('--dry-run');
  const fails = [];
  const iss = ghJson(['issue', 'view', String(n), '-R', REPO, '--json', 'state,title,closedByPullRequestsReferences']);
  const task = taskOf(iss.title);
  if (iss.state !== 'CLOSED') fails.push('issue is not closed');
  let merged = null;
  for (const ref of iss.closedByPullRequestsReferences || []) {
    const pr = ghJson(['pr', 'view', String(ref.number), '-R', REPO, '--json', 'number,state,title,body']);
    if (pr.state === 'MERGED') { merged = pr; break; }
  }
  if (!merged) fails.push('no merged PR in this repo closes the issue');
  else {
    const v = merged.body.split(/^## Verify\b/m)[1];
    if (!v) fails.push(`PR #${merged.number} has no "## Verify" section`);
    else for (const w of ['Red', 'Green', 'Stub']) if (!new RegExp(`\\b${w}\\b`).test(v)) fails.push(`PR #${merged.number} Verify section does not mention ${w}`);
    if (VI.test(merged.title) || VI.test(merged.body)) fails.push(`PR #${merged.number} title or body contains Vietnamese letters`);
  }
  try { execFileSync('git', ['-C', ROOT, 'pull', '-q'], { stdio: 'pipe' }); } catch { /* offline: check the local copy */ }
  const log = existsSync(join(ROOT, EVIDENCE)) ? readFileSync(join(ROOT, EVIDENCE), 'utf8') : '';
  if (task === null || !new RegExp(`^## T${task}\\b`, 'm').test(log)) fails.push(`evidence log has no "## T${task}" section on main`);
  const base = lastBaseline(n), now = counts();
  if (base && now) {
    if (base.vietnamese !== null && now.vietnamese !== null && now.vietnamese > base.vietnamese) fails.push(`vietnamese went up ${base.vietnamese} -> ${now.vietnamese}`);
    if (base.coupling !== null && now.coupling !== null && now.coupling > base.coupling) fails.push(`coupling went up ${base.coupling} -> ${now.coupling}`);
  }
  const ratchet = `vietnamese ${base?.vietnamese ?? 'n/a'} -> ${now?.vietnamese ?? 'n/a'}, coupling ${base?.coupling ?? 'n/a'} -> ${now?.coupling ?? 'n/a'}`;
  if (fails.length) {
    console.log(`FAIL #${n} (T${task})\n- ${fails.join('\n- ')}\n${ratchet}`);
    process.exit(1);
  }
  console.log(`PASS #${n} (T${task}) via PR #${merged.number}; ${ratchet}`);
  if (!dry) {
    try { gh(['issue', 'edit', String(n), '-R', REPO, '--remove-label', L_WORK]); } catch { /* label already gone */ }
    comment(n, `loop-check: PASS via PR #${merged.number}; ${ratchet}.`);
  }
}

function cmdRelease(n) {
  const reason = opt('--reason');
  if (!reason) die('release needs --reason "<why>"');
  const human = args.includes('--needs-human') || attempts(n) >= MAX_ATTEMPTS;
  const iss = ghJson(['issue', 'view', String(n), '-R', REPO, '--json', 'state']);
  if (iss.state === 'CLOSED') gh(['issue', 'reopen', String(n), '-R', REPO]);
  try { gh(['issue', 'edit', String(n), '-R', REPO, '--remove-label', L_WORK]); } catch { /* not labelled */ }
  if (human) gh(['issue', 'edit', String(n), '-R', REPO, '--add-label', L_HUMAN]);
  comment(n, `loop-release: ${reason}\n\n${human ? `Moved to \`${L_HUMAN}\` (attempts: ${attempts(n)}).` : 'Back in the queue.'}`);
  console.log(`released #${n}${human ? ' -> needs human' : ''}`);
}

const [cmd, nArg] = args;
const n = Number(nArg);
switch (cmd) {
  case 'status': cmdStatus(); break;
  case 'next': cmdNext(); break;
  case 'claim': if (!n) die('claim <N>'); cmdClaim(n); break;
  case 'brief': if (!n) die('brief <N>'); cmdBrief(n); break;
  case 'check': if (!n) die('check <N>'); cmdCheck(n); break;
  case 'release': if (!n) die('release <N> --reason "..."'); cmdRelease(n); break;
  default: die('usage: loop.mjs status | next | claim <N> | brief <N> | check <N> [--dry-run] | release <N> --reason "..." [--needs-human]');
}
