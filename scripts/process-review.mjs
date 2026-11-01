#!/usr/bin/env node
// Builds the process-review file in two steps (spec 2.12, decision 21, goal G14). The program counts, the model only groups.
//   node --import tsx scripts/process-review.mjs first-pass --events <f> [--signals <f>] [--rules <f>] --repo <o/r> --from <ISO> --to <ISO> --out <f>
//   node --import tsx scripts/process-review.mjs first-pass --real [--rules <f>] [--until <ISO>]
//   node --import tsx scripts/process-review.mjs assemble --first-pass <f> --groups <f> --out <f>
//   node --import tsx scripts/process-review.mjs model-run --real [--rules <f>] [--until <ISO>] [--model haiku|sonnet] [--max-usd <x>] [--show-causes]
//   node --import tsx scripts/process-review.mjs model-run --first-pass <f> --record <out> [--rules <f>] [--model haiku|sonnet] [--max-usd <x>]
// `model-run` starts one real model session (decision 50, scripts/process-review/model-run.mjs). Exit 1: its verdict is FAIL.
// `--signals` reads the body of GET /api/process/signals ({ gate, comments }); its items join the events (decision 48).
// `--real` reads the real database read-only, keeps the rows in memory and prints only counts. It writes no file.
// Exit 0: done. Exit 2: usage, or a file that is not valid (nothing was written). Exit 1: the database cannot be read.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint } from '../shared/domain/fingerprint.ts';
import { TEXT_PART_LIMIT } from '../server/services/process-service.ts';
import { DEFAULT_DB_URL, WINDOW_UNTIL } from './metrics/baseline.mjs';
import { checkProblem, CLUSTER_ID, groupProblems, text } from './process-review/groups.mjs';

const USAGE = `usage: process-review.mjs first-pass --events <f> [--signals <f>] [--rules <f>] --repo <o/r> --from <ISO> --to <ISO> --out <f>
       process-review.mjs first-pass --real [--rules <f>] [--until <ISO>]
       process-review.mjs assemble --first-pass <f> --groups <f> --out <f>
       process-review.mjs model-run --real [--rules <f>] [--until <ISO>] [--model haiku|sonnet] [--max-usd <x>] [--show-causes]
       process-review.mjs model-run --first-pass <f> --record <out> [--rules <f>] [--model haiku|sonnet] [--max-usd <x>]`;
const DEFAULT_RULES = join(dirname(fileURLToPath(import.meta.url)), 'process-review', 'rules.json');
const REPO = /^[\w.-]+\/[\w.-]+$/;
// One query, SELECT only. These are the columns of `text` in R2, and no name or prompt column.
export const REAL_SQL = `select id, started_at, status, error, summary, skip_reason
  from runs where started_at < $1 order by started_at, id`;

function fail(message, code = 2) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) fail(USAGE);
    if (a === '--real') options.real = true;
    else if (a === '--show-causes') options['show-causes'] = true;
    else {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) fail(`process-review: ${a} needs a value`);
      options[a.slice(2)] = value;
      i += 1;
    }
  }
  return options;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return fail(`process-review: cannot read ${file}: ${e.message}`);
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const isDate = (x) => typeof x === 'string' && !Number.isNaN(Date.parse(x));

/** The checked rules, each with its compiled `regex`. A bad file exits 2. */
function loadRules(file) {
  const data = readJson(file);
  if (data?.v !== 1 || !Array.isArray(data.rules)) fail('process-review: the rules file needs "v": 1 and a "rules" array');
  const seen = new Set();
  return data.rules.map((r, i) => {
    const name = `rule ${i + 1} (${r?.id ?? 'no id'})`;
    if (!CLUSTER_ID.test(r?.id ?? '')) fail(`process-review: ${name}: id must match ${CLUSTER_ID}`);
    if (seen.has(r.id)) fail(`process-review: ${name}: repeated id`);
    seen.add(r.id);
    if (!text(r.cause) || !text(r.pattern) || typeof r.flags !== 'string') fail(`process-review: ${name}: needs cause, pattern and flags`);
    const checkBad = checkProblem(r.check);
    if (checkBad) fail(`process-review: ${name}: ${checkBad}`);
    // A `g` or `y` regex keeps `lastIndex` between tests, so it skips matches.
    if (/[gy]/.test(r.flags)) fail(`process-review: ${name}: flags g and y are not allowed`);
    try {
      return { ...r, regex: new RegExp(r.pattern, r.flags) };
    } catch (e) {
      return fail(`process-review: ${name}: ${e.message}`);
    }
  });
}

/** The rows of the R2 shape: a list, or the `{ events }` body of GET /api/process/events. A bad row exits 2. */
function loadEvents(file) {
  const data = readJson(file);
  const events = Array.isArray(data) ? data : data?.events;
  if (!Array.isArray(events)) fail('process-review: the events file needs a list, or an "events" list');
  const seen = new Set();
  events.forEach((e, i) => {
    if (!text(e?.id) || !isDate(e?.at) || typeof e?.text !== 'string') fail(`process-review: event ${i + 1} needs id, at and text`);
    if (seen.has(e.id)) fail(`process-review: event id ${e.id} is repeated`);
    seen.add(e.id);
  });
  return events;
}

/** The items of R8: `{ gate, comments }`. An item has exactly `id`, `at`, `kind` and `text`, and its kind follows its list. A bad file exits 2. */
function loadSignals(file) {
  const data = readJson(file);
  if (!Array.isArray(data?.gate) || !Array.isArray(data?.comments)) fail('process-review: the signals file needs a "gate" list and a "comments" list');
  const KEYS = ['at', 'id', 'kind', 'text'];
  return [['gate', data.gate], ['comment', data.comments]].flatMap(([kind, list]) =>
    list.map((e, i) => {
      const name = `${kind} item ${i + 1}`;
      if (JSON.stringify(Object.keys(e ?? {}).sort()) !== JSON.stringify(KEYS)) fail(`process-review: ${name} needs exactly the keys ${KEYS.join(', ')}`);
      if (!text(e.id) || !isDate(e.at) || typeof e.text !== 'string') fail(`process-review: ${name} needs id, at and text`);
      if (e.kind !== kind) fail(`process-review: ${name} must have the kind ${kind}`);
      return e;
    }),
  );
}

/** The first rule that matches takes the event. `taken[i]` follows the event order. */
function split(events, rules) {
  const taken = rules.map(() => []);
  const rest = [];
  for (const e of events) {
    const i = rules.findIndex((r) => r.regex.test(e.text));
    (i === -1 ? rest : taken[i]).push(e);
  }
  return { taken, rest };
}

function period(events) {
  const sorted = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { earliest: sorted[0], firstAt: sorted[0].at, lastAt: sorted[sorted.length - 1].at };
}

function firstPass(o) {
  for (const key of ['events', 'repo', 'from', 'to', 'out']) if (!o[key]) fail(USAGE);
  if (o.until) fail(USAGE);
  if (!REPO.test(o.repo)) fail('process-review: --repo needs the form owner/name');
  if (!isDate(o.from) || !isDate(o.to)) fail('process-review: --from and --to need ISO dates');
  const rules = loadRules(o.rules ?? DEFAULT_RULES);
  const events = loadEvents(o.events);
  if (o.signals) {
    const seen = new Set(events.map((e) => e.id));
    for (const item of loadSignals(o.signals)) {
      if (seen.has(item.id)) fail(`process-review: id ${item.id} is repeated`);
      seen.add(item.id);
      events.push(item);
    }
  }
  const { taken, rest } = split(events, rules);
  // The first-pass form of spec 2.12 gives no time for a rule cluster, and `rest` does not hold its rows. So the two
  // times go in this file: assemble reads no other file.
  const clusters = rules.flatMap((r, i) => {
    if (taken[i].length === 0) return [];
    const { firstAt, lastAt } = period(taken[i]);
    return [{ id: r.id, cause: r.cause, ids: taken[i].map((e) => e.id), firstAt, lastAt, check: r.check }];
  });
  writeJson(o.out, { v: 1, from: o.from, to: o.to, repo: o.repo, clusters, rest });
}

/** `text` of R2 (server/services/process-service.ts): the non-empty columns, each cut at the limit, joined by a newline. */
function rowText(r) {
  return [r.error, r.summary, r.skip_reason]
    .filter((v) => v !== null && v !== '')
    .map((v) => v.slice(0, TEXT_PART_LIMIT))
    .join('\n');
}

/** The rows of the real database, in memory. One SELECT in a read-only session. */
async function readRealRows(until) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.LOOPS_BASELINE_DATABASE_URL ?? DEFAULT_DB_URL });
  try {
    await client.connect();
    await client.query('SET default_transaction_read_only = on');
    return (await client.query(REAL_SQL, [until])).rows;
  } catch (e) {
    // The driver can quote a value in its message, so only the code goes out.
    return fail(`process-review: the database read failed: ${e.code ?? 'no code'}`, 1);
  } finally {
    await client.end().catch(() => {});
  }
}

function checkRealOptions(o, others) {
  for (const key of others) if (o[key]) fail('process-review: --real takes only --rules and --until, and it writes no file');
  const until = o.until ?? WINDOW_UNTIL;
  if (!isDate(until)) fail('process-review: --until needs an ISO date');
  return until;
}

async function firstPassReal(o) {
  const until = checkRealOptions(o, ['events', 'signals', 'repo', 'from', 'to', 'out']);
  const rules = loadRules(o.rules ?? DEFAULT_RULES);
  const rows = await readRealRows(until);
  const { taken, rest } = split(rows.map((r) => ({ text: rowText(r) })), rules);
  rules.forEach((r, i) => process.stdout.write(`real ${r.id} ${taken[i].length}
`));
  process.stdout.write(`real rest ${rest.length}
`);
}

function loadFirstPass(file) {
  const pass = readJson(file);
  if (pass?.v !== 1 || !Array.isArray(pass.clusters) || !Array.isArray(pass.rest) || !REPO.test(pass.repo ?? '')) {
    fail('process-review: the first-pass file needs "v": 1, "repo", "clusters" and "rest"');
  }
  return pass;
}

async function modelRunCommand(o) {
  if (o.real && (o.record || o['first-pass'])) fail(USAGE);
  if (!o.real && !(o.record && o['first-pass'])) fail(USAGE);
  if (o.model !== undefined && !['haiku', 'sonnet'].includes(o.model)) fail(USAGE);
  if (o['max-usd'] !== undefined && !(Number(o['max-usd']) > 0)) fail('process-review: --max-usd needs a number above 0');
  if (o.record && (o.until || o['show-causes'])) fail(USAGE);
  const until = o.real ? checkRealOptions(o, ['events', 'signals', 'repo', 'from', 'to', 'out']) : null;
  const rules = loadRules(o.rules ?? DEFAULT_RULES);
  const ruleIds = rules.map((r) => r.id);
  const readRest = async () => {
    if (!o.real) {
      const pass = loadFirstPass(o['first-pass']);
      return { rest: pass.rest, ruleIds: [...new Set([...ruleIds, ...pass.clusters.map((c) => c.id)])] };
    }
    const { rest } = split((await readRealRows(until)).map((r) => ({ text: rowText(r) })), rules);
    // The run id stays out of the prompt. This number means something only in this process.
    return { rest: rest.map((e, i) => ({ ...e, id: `r${String(i + 1).padStart(3, '0')}` })), ruleIds };
  };
  const [{ query }, { runModelCommand }] = await Promise.all([import('@anthropic-ai/claude-agent-sdk'), import('./process-review/model-run.mjs')]);
  process.exitCode = await runModelCommand(o, { query, readRest, print: (line) => process.stdout.write(`${line}
`) });
}

function assemble(o) {
  for (const key of ['first-pass', 'groups', 'out']) if (!o[key]) fail(USAGE);
  const pass = loadFirstPass(o['first-pass']);
  const groups = readJson(o.groups);
  if (!Array.isArray(groups?.clusters)) fail('process-review: the groups file needs a "clusters" array');

  const rest = new Map(pass.rest.map((e) => [e.id, e]));
  const problems = groupProblems(pass, groups);
  if (problems.length) fail(`process-review: ${problems.join('; ')}. Nothing was written.`);

  const ruleClusters = pass.clusters.map((c) => ({
    id: c.id,
    cause: c.cause,
    events: c.ids.length,
    runIds: c.ids,
    firstAt: c.firstAt,
    lastAt: c.lastAt,
    repo: pass.repo,
    fingerprint: fingerprint(pass.repo, `rule:${c.id}`, c.cause),
    check: c.check,
  }));
  // Each key is set here. A count, a date or a hash in the group of the model never reaches the output.
  const modelClusters = groups.clusters.map((g) => {
    const { earliest, firstAt, lastAt } = period(g.ids.map((id) => rest.get(id)));
    return {
      id: g.id,
      cause: g.cause,
      events: g.ids.length,
      runIds: g.ids,
      firstAt,
      lastAt,
      repo: pass.repo,
      fingerprint: fingerprint(pass.repo, 'model', earliest.text),
      check: { kind: g.check.kind, name: g.check.name, replay: g.check.replay },
    };
  });
  writeJson(o.out, { v: 1, from: pass.from, to: pass.to, clusters: [...ruleClusters, ...modelClusters] });
}

const [command, ...rest] = process.argv.slice(2);
const options = parseOptions(rest);
if (command === 'first-pass' && options.real) await firstPassReal(options);
else if (command === 'first-pass') firstPass(options);
else if (command === 'assemble') assemble(options);
else if (command === 'model-run') await modelRunCommand(options);
else fail(USAGE);
