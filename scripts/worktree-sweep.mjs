#!/usr/bin/env node
// Worktree sweep: removes the worktree, the branch and the lane test databases of each task whose pull request is done.
//   node scripts/worktree-sweep.mjs [--dry] [--quiet]
// Run it from any worktree of the repository. `.githooks/post-merge` runs it after each `git pull`, and the Claude Code
// hook `SessionStart` of `.claude/settings.json` runs it when a session starts, so no agent has to remember the cleanup.
//
// A worktree is removed only when all of these are true:
//   - it is not the main worktree, and the sweep does not run in it;
//   - its branch has a pull request from this repository (not from a fork), and the newest one is MERGED or CLOSED;
//   - `git status` shows nothing (no change and no untracked file);
//   - its HEAD is the head commit of that pull request, so every commit is on GitHub.
// Every other worktree is kept, with its reason. A folder `<main folder>-*` next to the main worktree that git does not
// know as a worktree (a copy, an empty folder) is only reported: a person looks at it first.
// The lane databases are `loops_<lane>_test` and `loops_<lane>_live_test`, where the folder is `<main folder>-<lane>`.
// They are dropped through `LOOPS_SWEEP_DB_URL` (default: the compose.yml Postgres). If Postgres cannot be reached,
// the sweep says so and goes on.
// `LOOPS_GH_BIN` names the gh program (a path that ends in `.mjs` runs as a script of the current Node), else `gh`.
// It makes no network call except `gh pr list`, and it never opens a login window.
// Exit 0: done. Exit 1: a worktree could not be removed. Exit 2: a bad argument, or a failed git or gh call, and then
// nothing is removed, because every decision is made before the first removal.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const QUIET = args.includes('--quiet');
for (const a of args) if (a !== '--dry' && a !== '--quiet') fail(`unknown argument ${a}`);

// A hook runs with GIT_DIR and GIT_WORK_TREE set for its own worktree. Those must not reach a git call for another one.
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' };
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR']) delete env[k];

function fail(message) {
  process.stderr.write(`worktree-sweep: ${message}\n`);
  process.exit(2);
}

function say(line) {
  if (!QUIET) process.stdout.write(`${line}\n`);
}

function git(cwd, list) {
  const r = spawnSync('git', list, { cwd, env, encoding: 'utf8' });
  if (r.error) fail(`cannot run git: ${r.error.message}`);
  if (r.status !== 0) fail(`git ${list.join(' ')} failed (exit ${r.status}): ${(r.stderr || '').trim()}`);
  return r.stdout;
}

function gh(list) {
  const bin = process.env.LOOPS_GH_BIN || 'gh';
  const isScript = bin.endsWith('.mjs');
  const [cmd, argv] = isScript ? [process.execPath, [bin, ...list]] : [bin, list];
  const shell = !isScript && process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
  const r = spawnSync(cmd, argv, { env, encoding: 'utf8', shell });
  if (r.error) fail(`cannot run ${bin}: ${r.error.message}`);
  if (r.status !== 0) fail(`gh ${list.slice(0, 2).join(' ')} failed (exit ${r.status}): ${(r.stderr || '').trim()}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    fail(`gh ${list.slice(0, 2).join(' ')} printed output that is not JSON`);
  }
}

/** One spelling of a path, so that `C:/a` from git and `C:\a` from Node compare equal. */
function key(p) {
  const r = resolve(p).replaceAll('\\', '/');
  return process.platform === 'win32' ? r.toLowerCase() : r;
}
const shown = (p) => resolve(p).replaceAll('\\', '/');
const short = (sha) => sha.slice(0, 7);

function worktrees(cwd) {
  const list = [];
  let cur = null;
  for (const line of git(cwd, ['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) list.push((cur = { path: line.slice(9), head: '', branch: null }));
    else if (cur && line.startsWith('HEAD ')) cur.head = line.slice(5);
    else if (cur && line.startsWith('branch refs/heads/')) cur.branch = line.slice(18);
  }
  return list;
}

function decide(wt, here) {
  if (key(wt.path) === here) return { keep: 'the sweep runs in this worktree' };
  if (!wt.branch) return { keep: 'no branch (detached HEAD)' };
  const prs = gh(['pr', 'list', '--head', wt.branch, '--state', 'all', '--limit', '20', '--json', 'number,state,headRefName,headRefOid,isCrossRepository']);
  if (!Array.isArray(prs)) fail('gh pr list did not print a list');
  const own = prs.filter((p) => p && p.headRefName === wt.branch && p.isCrossRepository !== true).sort((a, b) => b.number - a.number);
  const pr = own[0];
  if (!pr) return { keep: 'no pull request' };
  if (pr.state !== 'MERGED' && pr.state !== 'CLOSED') return { keep: `PR #${pr.number} is ${pr.state}` };
  if (git(wt.path, ['status', '--porcelain']).trim() !== '') return { keep: 'uncommitted changes' };
  if (wt.head !== pr.headRefOid) return { keep: `HEAD ${short(wt.head)} is not the head ${short(pr.headRefOid)} of PR #${pr.number}` };
  return { remove: `PR #${pr.number} ${pr.state}` };
}

function laneDatabases(mainPath, wtPath) {
  const prefix = `${basename(mainPath)}-`;
  const name = basename(wtPath);
  if (!name.startsWith(prefix)) return [];
  const lane = name.slice(prefix.length).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return lane ? [`loops_${lane}_test`, `loops_${lane}_live_test`] : [];
}

async function dropDatabases(names) {
  const url = process.env.LOOPS_SWEEP_DB_URL || `postgres://loops:loops@127.0.0.1:${process.env.LOOPS_PG_PORT ?? 55432}/postgres`;
  let client;
  try {
    const pg = (await import('pg')).default;
    client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
    await client.connect();
    const found = await client.query('select datname from pg_database where datname = any($1)', [names]);
    const dropped = [];
    for (const { datname } of found.rows) {
      if (!/^loops_[a-z0-9_]+_test$/.test(datname) || datname === 'loops_test') continue;
      await client.query(`DROP DATABASE IF EXISTS "${datname}"`);
      dropped.push(datname);
    }
    say(`  dropped databases: ${dropped.length ? dropped.join(', ') : 'none existed'}`);
  } catch (err) {
    process.stdout.write(`  databases not dropped (${names.join(', ')}): ${err.message}\n`);
  } finally {
    await client?.end().catch(() => {});
  }
}

const cwd = process.cwd();
git(cwd, ['worktree', 'prune']);
const all = worktrees(cwd);
if (all.length === 0) fail('git worktree list printed no worktree');
const main = all[0];
const here = key(git(cwd, ['rev-parse', '--show-toplevel']).trim());

// Every decision first: a failed call stops the sweep before anything is removed.
const plan = all.slice(1).map((wt) => ({ wt, ...decide(wt, here) }));

let failed = 0;
for (const { wt, keep, remove } of plan) {
  if (keep) {
    say(`kept: ${shown(wt.path)} (${wt.branch ?? 'no branch'}: ${keep})`);
    continue;
  }
  const what = `${shown(wt.path)} (${wt.branch}, ${remove})`;
  if (DRY) {
    say(`would remove: ${what}`);
    continue;
  }
  const r = spawnSync('git', ['worktree', 'remove', wt.path], { cwd: main.path, env, encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    process.stderr.write(`worktree-sweep: could not remove ${shown(wt.path)}: ${(r.stderr || '').trim()}\n`);
    continue;
  }
  git(main.path, ['branch', '-D', wt.branch]);
  process.stdout.write(`removed: ${what}\n`);
  const dbs = laneDatabases(main.path, wt.path);
  if (dbs.length) await dropDatabases(dbs);
}

// Folders next to the main worktree that look like a lane but are not a worktree.
const known = new Set(all.map((w) => key(w.path)));
const parent = dirname(resolve(main.path));
const prefix = `${basename(resolve(main.path))}-`;
for (const name of readdirSync(parent)) {
  const full = join(parent, name);
  if (!name.startsWith(prefix) || known.has(key(full))) continue;
  let isDir = false;
  try {
    isDir = statSync(full).isDirectory();
  } catch {}
  if (isDir) say(`not a worktree: ${shown(full)} (look at it, then delete it by hand)`);
}

process.exit(failed ? 1 : 0);
