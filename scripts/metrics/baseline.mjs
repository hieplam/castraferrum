#!/usr/bin/env node
// Baseline of each ratchet of the goal-driven loop (epic 217, task F0).
//   node scripts/metrics/baseline.mjs --metric <name>
//   node scripts/metrics/baseline.mjs --all [--check] [--now <ISO>] [--projects-dir <dir>]
// A line is `<name> <value> <unit> <source>`. The tool reads the real database read-only and prints no loop name,
// prompt or summary (decision 14 of the spec): it selects only ids, times, statuses, the error head and the session id.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WINDOW_UNTIL = '2026-10-23T00:00:00Z';
export const CHECK_NOW = '2026-11-01T15:15:00Z';
export const DEFAULT_DB_URL = 'postgres://loops:loops@127.0.0.1:55432/loops';
// One query, SELECT only, no name, prompt or summary column. `left(error, 40)` keeps the head that the limit test needs.
export const RUNS_SQL = `select loop_id, status, started_at, finished_at, left(error, 40) as error, session_id
  from runs where started_at < $1 order by loop_id, started_at`;

const LIVE = [
  ['idle-runs', 'sessions', 'transcripts'],
  ['gap', 'min', 'runs'],
  ['limit-failures', 'runs', 'runs'],
  ['idle-days', 'days', 'runs'],
  ['late-tasks', 'percent', 'github'],
];
const RECORDED = [
  ['owner-stops', '6', 'stops'],
  ['dead-claims', '253', 'hours'],
  ['merged-on-red', '12', 'PRs'],
  ['stub-share', '0', 'percent'],
  ['poll-share', '37', 'percent'],
  ['first-goal-day', '3', 'day'],
  ['status-questions', '7', 'questions'],
  ['owner-messages', '0.84,1.77', 'messages per PR'],
  ['causes-found', '0', 'causes'],
  ['cause-repeats', '11', 'repeats'],
  ['blocked-runs', '12', 'runs'],
];
export const METRIC_NAMES = [...LIVE.map((m) => m[0]), ...RECORDED.map((m) => m[0])];

const ms = (d) => new Date(d).getTime();
const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Median of the waits between a finish and the next start of the same loop. Skipped rows are out. Minutes. */
export function gapMinutes(rows) {
  const byLoop = new Map();
  for (const r of rows) {
    if (r.status === 'skipped') continue;
    if (!byLoop.has(r.loop_id)) byLoop.set(r.loop_id, []);
    byLoop.get(r.loop_id).push(r);
  }
  const waits = [];
  for (const list of byLoop.values()) {
    list.sort((a, b) => ms(a.started_at) - ms(b.started_at));
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1].finished_at;
      if (prev) waits.push((ms(list[i].started_at) - ms(prev)) / 60_000);
    }
  }
  if (waits.length === 0) return 0;
  waits.sort((a, b) => a - b);
  const mid = waits.length >> 1;
  return round(waits.length % 2 ? waits[mid] : (waits[mid - 1] + waits[mid]) / 2, 1);
}

/** Failed rows whose error starts with the plan limit text. */
export function limitFailures(rows) {
  return rows.filter((r) => r.status === 'failed' && /^You.ve hit your/.test(r.error ?? '')).length;
}

/** Whole days between `now` and the latest start. */
export function idleDays(rows, now) {
  const latest = Math.max(...rows.map((r) => ms(r.started_at)));
  return Math.round((ms(now) - latest) / 86_400_000);
}

const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);
/** Number of sessions (one jsonl text each) that changed nothing: no write tool, no push, no pull request. */
export function idleRuns(sessionTexts) {
  let idle = 0;
  for (const text of sessionTexts) {
    let active = false;
    for (const line of text.split('\n')) {
      if (!line.includes('"tool_use"')) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const content = entry?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type !== 'tool_use') continue;
        if (WRITE_TOOLS.has(block.name)) active = true;
        else if (block.name === 'Bash' && /git push|gh pr create/.test(String(block.input?.command ?? ''))) active = true;
      }
      if (active) break;
    }
    if (!active) idle += 1;
  }
  return idle;
}

/** Percent of the creation times that fall in the 10 hours before the latest one (the latest included). */
export function lateTasks(createdAts) {
  if (createdAts.length === 0) return 0;
  const times = createdAts.map(ms);
  const from = Math.max(...times) - 10 * 3_600_000;
  return round((times.filter((t) => t >= from).length / times.length) * 100, 1);
}

/** Typed owner messages per merged PR. `typed` is a count, or the user entries of a session (tool results do not count). */
export function ownerMessagesPerPr(typed, prs) {
  const count = Array.isArray(typed)
    ? typed.filter((e) => {
        const m = e?.message ?? e;
        if (m?.role !== 'user') return false;
        return typeof m.content === 'string' || (Array.isArray(m.content) && !m.content.some((b) => b?.type === 'tool_result'));
      }).length
    : typed;
  return round(count / prs, 2);
}

const unitOf = (name) => [...LIVE, ...RECORDED.map(([n, , u]) => [n, u, 'recorded'])].find((m) => m[0] === name);
export function metricLine(name, value) {
  const [, unit, source] = unitOf(name);
  const shown = name === 'gap' || name === 'late-tasks' ? Number(value).toFixed(1) : String(value);
  return `${name} ${shown} ${unit} ${source}`;
}

/** All 16 lines. `idle` and `late` are the already measured values of the two metrics that need files and GitHub. */
export function allLines({ rows, now, idle, late }) {
  const live = {
    'idle-runs': idle,
    gap: gapMinutes(rows),
    'limit-failures': limitFailures(rows),
    'idle-days': idleDays(rows, now),
    'late-tasks': late,
  };
  return [
    `window ${rows.length} rows until ${WINDOW_UNTIL}`,
    ...LIVE.map(([name]) => metricLine(name, live[name])),
    ...RECORDED.map(([name, value]) => metricLine(name, value)),
  ];
}

async function readRows(url) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SET default_transaction_read_only = on');
    const { rows } = await client.query(RUNS_SQL, [WINDOW_UNTIL]);
    return { rows, sessionIds: rows.map((r) => r.session_id).filter(Boolean) };
  } finally {
    await client.end();
  }
}

function sessionTexts(sessionIds, projectsDir) {
  if (!existsSync(projectsDir)) return [];
  const dirs = readdirSync(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(projectsDir, d.name));
  const texts = [];
  for (const id of new Set(sessionIds)) {
    for (const dir of dirs) {
      const file = join(dir, `${id}.jsonl`);
      if (existsSync(file)) {
        texts.push(readFileSync(file, 'utf8'));
        break;
      }
    }
  }
  return texts;
}

function epicSubIssueTimes() {
  const times = [];
  let after = null;
  for (;;) {
    const query = 'query($after:String){repository(owner:"hieplam",name:"castraferrum"){issue(number:63){subIssues(first:100,after:$after){pageInfo{hasNextPage endCursor} nodes{createdAt}}}}}';
    const args = ['api', 'graphql', '-f', `query=${query}`];
    if (after) args.push('-f', `after=${after}`);
    const r = spawnSync('gh', args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`gh api graphql failed: ${String(r.stderr).trim()}`);
    const sub = JSON.parse(r.stdout).data.repository.issue.subIssues;
    times.push(...sub.nodes.map((n) => n.createdAt));
    if (!sub.pageInfo.hasNextPage) return times;
    after = sub.pageInfo.endCursor;
  }
}

function parseArgs(argv) {
  const opts = { metric: null, all: false, check: false, now: null, projectsDir: join(homedir(), '.claude', 'projects') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--metric') opts.metric = argv[++i];
    else if (a === '--all') opts.all = true;
    else if (a === '--check') opts.check = true;
    else if (a === '--now') opts.now = argv[++i];
    else if (a === '--projects-dir') opts.projectsDir = argv[++i];
    else return { ...opts, bad: a };
  }
  return opts;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.bad || (!opts.all && !opts.metric) || (opts.check && !opts.all)) {
    console.error('usage: baseline.mjs --metric <name> | --all [--check] [--now <ISO>] [--projects-dir <dir>]');
    return 2;
  }
  if (opts.metric && !METRIC_NAMES.includes(opts.metric)) {
    console.error(`unknown metric: ${opts.metric}`);
    return 2;
  }
  const now = new Date(opts.now ?? (opts.check ? CHECK_NOW : Date.now()));
  const needs = (name) => opts.all || opts.metric === name;
  const needsRows = opts.all || ['idle-runs', 'gap', 'limit-failures', 'idle-days'].includes(opts.metric);
  const { rows, sessionIds } = needsRows
    ? await readRows(process.env.LOOPS_BASELINE_DATABASE_URL ?? DEFAULT_DB_URL)
    : { rows: [], sessionIds: [] };
  const idle = needs('idle-runs') ? idleRuns(sessionTexts(sessionIds, opts.projectsDir)) : 0;
  const late = needs('late-tasks') ? lateTasks(epicSubIssueTimes()) : 0;
  const lines = allLines({ rows, now, idle, late });
  if (!opts.all) {
    console.log(lines.find((l) => l.startsWith(`${opts.metric} `)));
    return 0;
  }
  if (!opts.check) {
    console.log(lines.join('\n'));
    return 0;
  }
  const file = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'baseline.json'), 'utf8'));
  const expected = [
    `window ${file.window.rows} rows until ${file.window.until}`,
    ...METRIC_NAMES.map((name) => {
      const m = file.metrics[name];
      return m ? `${name} ${m.value} ${m.unit} ${m.source}` : `${name} missing`;
    }),
  ];
  const diffs = lines.flatMap((line, i) => (line === expected[i] ? [] : [`- committed ${expected[i]}\n  measured  ${line}`]));
  if (diffs.length === 0) {
    console.log(`baseline: ${METRIC_NAMES.length} metrics, 0 differences`);
    return 0;
  }
  console.log(`baseline: ${METRIC_NAMES.length} metrics, ${diffs.length} differences\n${diffs.join('\n')}`);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(3);
    },
  );
}
