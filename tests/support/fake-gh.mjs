#!/usr/bin/env node
// A fake `gh` for tests (F2). All state lives in the JSON file named by FAKE_GH_WORLD:
// { bare, issues, prs, statuses, checkRuns, calls }. See fake-gh-kit.ts for how to seed and read the world.
//
// Supported commands (anything else prints `fake-gh: unsupported: <args>` and exits 64):
//   issue create --title --body|--body-file [--label]...      prints https://github.com/fake/repo/issues/<n>
//       as the real gh does, a label that is not in `world.labels` is refused: `could not add label: '<name>' not found`, exit 1
//   label create <name> [--force]      adds <name> to `world.labels`; with no --force, an existing label is refused (exit 1)
//   issue list [--state open|closed|all] [--search] [--label]... [--limit <n>] --json <fields>
//       search = substring of title or body (case-insensitive); `in:body` and quotes are stripped;
//       `updated:>=YYYY-MM-DD` keeps the issues whose updatedAt is on or after that day
//       (a comment has `id`, `createdAt` and `body`; `issue comment` sets the first two)
//   issue view <n> --json <fields>
//   issue comment <n> --body
//   issue edit <n> [--body] [--add-label]... [--remove-label]...
//   issue close <n>
//   issue reopen <n>
// `-R <owner/name>` and `--repo` are accepted and ignored: the fake holds one repository.
//   pr create --head --base --title --body        prints https://github.com/fake/repo/pull/<n>
//   pr list --json <fields>        pr view <n> --json <fields>
//       a pull request that is not in the world prints the real text: `GraphQL: Could not resolve to a PullRequest with the number of <n>. (repository.pullRequest)`, exit 1
//   (a pull request has `closingIssuesReferences`: [{ number }], read from "Closes #n" in its body at `pr create`; a test can seed it)
//   pr merge <n> --squash [--match-head-commit <sha>]
//       real git in the bare repository `world.bare`; a wrong sha prints
//       `fake-gh: head commit does not match` and exits 1
//   api [-X POST] repos/fake/repo/statuses/<sha> -f state= -f context= -f description=
//   api [-X GET] repos/fake/repo/commits/<sha>/status
//   api repos/fake/repo/commits/<sha>/check-runs
//   api repos/fake/repo/issues/<n>                         prints { id, number }; `id` is not the number, as on GitHub
//   api -X POST repos/fake/repo/issues/<n>/sub_issues -F sub_issue_id=<id>      adds the child number to `world.subIssues[n]`
// A test makes one call fail: `world.failNext` lists `<group> <sub>` texts, for example `pr create`. The next such call exits 1 and leaves the list without that text.
// `--json` takes comma-separated GitHub field names. Every call, a failed one too, is appended to `calls`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_URL = 'https://github.com/fake/repo';
const args = process.argv.slice(2);
const worldPath = process.env.FAKE_GH_WORLD;

class Exit extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function loadWorld() {
  if (!worldPath) throw new Exit(2, 'fake-gh: FAKE_GH_WORLD is not set');
  const w = JSON.parse(readFileSync(worldPath, 'utf8'));
  for (const k of ['issues', 'prs', 'calls', 'labels', 'failNext']) w[k] ??= [];
  for (const k of ['statuses', 'checkRuns', 'subIssues']) w[k] ??= {};
  w.bare ??= null;
  return w;
}

/** Parse flags: repeated flags collect into arrays, `-f k=v` into `fields`, the rest are positionals. */
function parse(list) {
  const flags = {};
  const positional = [];
  const fields = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a === '-f' || a === '-F' || a === '--field' || a === '--raw-field') {
      const kv = String(list[++i] ?? '');
      const eq = kv.indexOf('=');
      fields[kv.slice(0, eq)] = kv.slice(eq + 1);
    } else if (a === '-R') {
      flags.repo = [list[++i]];
    } else if (a === '-X') {
      flags.method = String(list[++i] ?? '').toUpperCase();
    } else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      const value = eq === -1 ? (BOOLEAN.has(name) ? true : list[++i]) : a.slice(eq + 1);
      (flags[name] ??= []).push(value);
    } else positional.push(a);
  }
  return { flags, positional, fields };
}
const BOOLEAN = new Set(['squash']);
const one = (flags, name) => (flags[name] ? flags[name][flags[name].length - 1] : undefined);

function nextNumber(w) {
  return Math.max(0, ...w.issues.map((x) => x.number), ...w.prs.map((x) => x.number)) + 1;
}
const now = () => new Date().toISOString();

function pick(obj, jsonFlag) {
  if (jsonFlag === undefined) return obj;
  const out = {};
  for (const f of String(jsonFlag).split(',')) if (f) out[f] = obj[f] ?? (f === 'isCrossRepository' ? false : null);
  return out;
}
function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
function find(list, numberText, what) {
  const hit = list.find((x) => x.number === Number(numberText));
  if (!hit) throw new Exit(1, `fake-gh: ${what} ${numberText} not found`);
  return hit;
}

function git(cwd, gitArgs) {
  return execFileSync(
    'git',
    ['-c', 'user.name=Fake GitHub', '-c', 'user.email=fake@example.com', '-c', 'commit.gpgsign=false', ...gitArgs],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

const ISSUE_ID_BASE = 9000;

function issueCmd(w, sub, rest) {
  const { flags, positional } = parse(rest);
  const json = one(flags, 'json');
  if (sub === 'create') {
    for (const name of flags.label ?? []) if (!w.labels.includes(name)) throw new Exit(1, `could not add label: '${name}' not found`);
    const n = nextNumber(w);
    const t = now();
    w.issues.push({
      number: n,
      title: String(one(flags, 'title') ?? ''),
      body: String(one(flags, 'body-file') ? readFileSync(one(flags, 'body-file'), 'utf8') : (one(flags, 'body') ?? '')),
      state: 'OPEN',
      labels: (flags.label ?? []).map((name) => ({ name })),
      comments: [],
      author: { login: String(one(flags, 'repo') ?? 'fake/repo').split('/')[0] },
      url: `${REPO_URL}/issues/${n}`,
      createdAt: t,
      updatedAt: t,
      closedAt: null,
    });
    console.log(`${REPO_URL}/issues/${n}`);
  } else if (sub === 'list') {
    const state = String(one(flags, 'state') ?? 'open').toLowerCase();
    const rawSearch = String(one(flags, 'search') ?? '');
    // `updated:>=YYYY-MM-DD` keeps the issues updated on or after that day (UTC), as GitHub does.
    const since = /updated:>=(\d{4}-\d{2}-\d{2})/.exec(rawSearch)?.[1];
    const search = rawSearch
      .replace(/updated:>=\S+/g, '')
      .replace(/in:(body|title)/g, '')
      .replace(/["']/g, '')
      .trim()
      .toLowerCase();
    const labels = flags.label ?? [];
    const hits = w.issues.filter(
      (i) =>
        (state === 'all' || i.state.toLowerCase() === state) &&
        labels.every((l) => i.labels.some((x) => x.name === l)) &&
        (!since || i.updatedAt.slice(0, 10) >= since) &&
        (!search || `${i.title}\n${i.body}`.toLowerCase().includes(search)),
    );
    const limit = one(flags, 'limit');
    print((limit === undefined ? hits : hits.slice(0, Number(limit))).map((i) => pick(i, json)));
  } else if (sub === 'view') {
    print(pick(find(w.issues, positional[0], 'issue'), json));
  } else if (sub === 'comment') {
    const i = find(w.issues, positional[0], 'issue');
    i.comments.push({ id: `IC_${i.number}_${i.comments.length + 1}`, createdAt: now(), body: String(one(flags, 'body') ?? ''), authorAssociation: 'OWNER' });
    i.updatedAt = now();
    console.log(`${i.url}#issuecomment-${i.comments.length}`);
  } else if (sub === 'edit') {
    const i = find(w.issues, positional[0], 'issue');
    if (one(flags, 'body') !== undefined) i.body = String(one(flags, 'body'));
    for (const name of flags['add-label'] ?? []) if (!i.labels.some((l) => l.name === name)) i.labels.push({ name });
    const drop = new Set(flags['remove-label'] ?? []);
    i.labels = i.labels.filter((l) => !drop.has(l.name));
    i.updatedAt = now();
    console.log(i.url);
  } else if (sub === 'close') {
    const i = find(w.issues, positional[0], 'issue');
    i.state = 'CLOSED';
    i.closedAt = i.updatedAt = now();
    console.log(`Closed issue #${i.number}`);
  } else if (sub === 'reopen') {
    const i = find(w.issues, positional[0], 'issue');
    i.state = 'OPEN';
    i.closedAt = null;
    i.updatedAt = now();
    console.log(`Reopened issue #${i.number}`);
  } else return false;
  return true;
}

function labelCmd(w, sub, rest) {
  const { flags, positional } = parse(rest);
  if (sub !== 'create') return false;
  const name = String(positional[0] ?? '');
  if (!name) throw new Exit(1, 'fake-gh: label name is required');
  if (w.labels.includes(name)) {
    if (!flags.force) throw new Exit(1, `fake-gh: label "${name}" already exists; use --force to update it`);
  } else w.labels.push(name);
  console.log(`Label "${name}" created`);
  return true;
}

/** GitHub links a PR to the issues that its body closes ("Closes #7", "Fixes #7", "Resolves #7"). */
function closingIssues(body) {
  const found = [...body.matchAll(/\b(?:close[sd]?|fix(?:es|ed)?|resolve[sd]?)\s+#(\d+)/gi)].map((m) => ({ number: Number(m[1]) }));
  return found.filter((x, i) => found.findIndex((y) => y.number === x.number) === i);
}

function prCmd(w, sub, rest) {
  const { flags, positional } = parse(rest);
  const json = one(flags, 'json');
  if (sub === 'create') {
    const n = nextNumber(w);
    const head = String(one(flags, 'head') ?? '');
    let oid = '';
    if (w.bare) {
      try {
        oid = git(w.bare, ['rev-parse', `refs/heads/${head}`]);
      } catch {
        oid = '';
      }
    }
    w.prs.push({
      number: n,
      title: String(one(flags, 'title') ?? ''),
      body: String(one(flags, 'body') ?? ''),
      state: 'OPEN',
      headRefName: head,
      baseRefName: String(one(flags, 'base') ?? 'main'),
      headRefOid: oid,
      mergeCommit: null,
      closingIssuesReferences: closingIssues(String(one(flags, 'body') ?? '')),
      url: `${REPO_URL}/pull/${n}`,
      createdAt: now(),
      mergedAt: null,
    });
    console.log(`${REPO_URL}/pull/${n}`);
  } else if (sub === 'list') {
    print(w.prs.map((p) => pick(p, json)));
  } else if (sub === 'view') {
    // The text that the real `gh pr view <n>` prints for a pull request that does not exist (exit 1).
    const hit = w.prs.find((x) => x.number === Number(positional[0]));
    if (!hit) throw new Exit(1, `GraphQL: Could not resolve to a PullRequest with the number of ${positional[0]}. (repository.pullRequest)`);
    print(pick(hit, json));
  } else if (sub === 'merge') {
    const p = find(w.prs, positional[0], 'pull request');
    if (p.state !== 'OPEN') throw new Exit(1, `fake-gh: pull request ${p.number} is not open`);
    if (!w.bare) throw new Exit(1, 'fake-gh: the world has no bare repository');
    const headNow = git(w.bare, ['rev-parse', `refs/heads/${p.headRefName}`]);
    const expected = one(flags, 'match-head-commit');
    if (expected !== undefined && expected !== headNow) throw new Exit(1, 'fake-gh: head commit does not match');
    const dir = mkdtempSync(join(tmpdir(), 'lc-fake-merge-'));
    try {
      git(tmpdir(), ['clone', '-q', w.bare, dir]);
      git(dir, ['checkout', '-q', p.baseRefName]);
      git(dir, ['merge', '--squash', `origin/${p.headRefName}`]);
      git(dir, ['commit', '-q', '--allow-empty', '-m', `${p.title} (#${p.number})`]);
      p.mergeCommit = { oid: git(dir, ['rev-parse', 'HEAD']) };
      git(dir, ['push', '-q', 'origin', `HEAD:refs/heads/${p.baseRefName}`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    p.headRefOid = headNow;
    p.state = 'MERGED';
    p.mergedAt = now();
    console.log(`Merged pull request #${p.number}`);
  } else return false;
  return true;
}

function apiCmd(w, rest) {
  const { flags, positional, fields } = parse(rest);
  const path = String(positional[0] ?? '').replace(/^\//, '');
  let m;
  if ((m = path.match(/^repos\/fake\/repo\/statuses\/([0-9a-f]+)$/)) && flags.method === 'POST') {
    const status = {
      state: fields.state ?? '',
      context: fields.context ?? 'default',
      description: fields.description ?? '',
      created_at: now(),
    };
    (w.statuses[m[1]] ??= []).push(status);
    print({ sha: m[1], ...status });
  } else if ((m = path.match(/^repos\/fake\/repo\/commits\/([0-9a-f]+)\/status$/)) && (!flags.method || flags.method === 'GET')) {
    const latest = new Map();
    for (const s of w.statuses[m[1]] ?? []) latest.set(s.context, s);
    const statuses = [...latest.values()];
    const states = statuses.map((s) => s.state);
    const state = !states.length
      ? 'pending'
      : states.some((s) => s === 'failure' || s === 'error')
        ? 'failure'
        : states.some((s) => s === 'pending')
          ? 'pending'
          : 'success';
    print({ sha: m[1], state, total_count: statuses.length, statuses });
  } else if ((m = path.match(/^repos\/fake\/repo\/commits\/([0-9a-f]+)\/check-runs$/)) && (!flags.method || flags.method === 'GET')) {
    const runs = w.checkRuns[m[1]] ?? [];
    print({ total_count: runs.length, check_runs: runs });
  } else if ((m = path.match(/^repos\/fake\/repo\/issues\/(\d+)$/)) && (!flags.method || flags.method === 'GET')) {
    const issue = find(w.issues, m[1], 'issue');
    print({ id: ISSUE_ID_BASE + issue.number, number: issue.number });
  } else if ((m = path.match(/^repos\/fake\/repo\/issues\/(\d+)\/sub_issues$/)) && flags.method === 'POST') {
    const child = find(w.issues, Number(fields.sub_issue_id) - ISSUE_ID_BASE, 'issue');
    (w.subIssues[m[1]] ??= []).push(child.number);
    print({ number: child.number });
  } else return false;
  return true;
}

let exit = 0;
let world = null;
try {
  world = loadWorld();
  const [group, sub, ...rest] = args;
  const failing = world.failNext.indexOf(`${group} ${sub}`);
  if (failing !== -1) {
    world.failNext.splice(failing, 1);
    throw new Exit(1, `fake-gh: ${group} ${sub} failed, as the test asked`);
  }
  const handled =
    group === 'issue' ? issueCmd(world, sub, rest) : group === 'pr' ? prCmd(world, sub, rest) : group === 'label' ? labelCmd(world, sub, rest) : group === 'api' ? apiCmd(world, args.slice(1)) : false;
  if (!handled) throw new Exit(64, `fake-gh: unsupported: ${args.join(' ')}`);
} catch (e) {
  exit = e instanceof Exit ? e.code : 1;
  process.stderr.write(`${e instanceof Exit ? e.message : `fake-gh: ${e?.stderr || e?.message || e}`}\n`);
}
if (world) {
  world.calls.push({ args, exit });
  writeFileSync(worldPath, JSON.stringify(world, null, 2));
}
process.exitCode = exit;
