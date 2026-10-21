// The "world" of the approved design preview (design/preview/data.js) seeded STRAIGHT into Postgres — so the shots of the
// real app (tests/visual/) placed next to the preview shots carry exactly the same data: same repos, same Claude loops
// (model / effort, optional timeout), same execution #k, same runs (session id, cost, summary, console log lines —
// D-UI18). It reads data.js itself (one source — when the preview changes, the seeded data follows), nothing is copied by
// hand. The list world and the detail world are one.
//
// Now of the world = Sunday 18/10/2026 14:00:42 Vietnam time (`PREVIEW_NOW`); the server crashed on 17/10 at 09:31:05 and
// restarted at 09:58:20. Tests set the server clock (`/api/__test/clock`) BEFORE seeding (otherwise the ticker runs the
// ticks that are already overdue compared with the real time) and the browser clock (`page.clock.setFixedTime`) to that
// moment. Whether the folders of the sample repos exist depends on the machine → forced through `/api/__test/dirs`
// (`previewDirs`): only "acme-api (old)" is missing its folder, as in the preview.
//
// Two levels (`history`):
// - `false` (list screen, overview bar, Repo page): every repo, loop and execution; runs only of the current / latest
//   execution — exactly the figures the preview prints in the top bar (31 runs today, 7 errors in 24 hours).
// - `true` (detail screens): adds the runs of older executions so the execution history table is right (✓ ✗ ⊘ ↷, session
//   count). Execution #4 of "Check test coverage" (17/10 21:05 → 23:58, ✗ 4) lies inside the last 24 hours → the top bar
//   shows 11 errors instead of 7: the preview contradicts itself (spec Q16) — the detail tests mask the "errors 24h" cell.
//
// Runs the preview does not list (e.g. runs #1…#8 of "Digest upstream releases") are added: the first run at Start, the
// later ones spread evenly up to the earliest listed run; their durations are picked so the average of the current
// execution matches the number the preview prints ("Avg per run").
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import type pg from 'pg';
import { REPO_MISSING_PREFIX } from '../../shared/domain/cost';
import { en } from '../../shared/i18n/en';

const DATA_JS = fileURLToPath(new URL('../../design/preview/data.js', import.meta.url));

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
export type PreviewData = {
  now: string;
  restartedAt: string;
  crashAt: string;
  stats: { activeLoops: number; runningRuns: number; runsToday: number; errors24h: number };
  order: string[];
  counts: { all: number; active: number; stopped: number; archived: number };
  repos: Record<string, { id: string; name: string; path: string; added: string; gone?: boolean }>;
  repoOrder: string[];
  loops: Record<string, Any>;
  executions: Record<string, Any[]>;
  runs: Record<string, Any[]>;
  many: Any[][];
};
/* eslint-enable @typescript-eslint/no-explicit-any */

let cached: PreviewData | null = null;
export function previewData(): PreviewData {
  if (cached) return cached;
  const sandbox = { window: {} as { PV?: PreviewData } };
  runInNewContext(readFileSync(DATA_JS, 'utf8'), sandbox);
  if (!sandbox.window.PV) throw new Error('design/preview/data.js does not set window.PV');
  cached = sandbox.window.PV;
  return cached;
}

/** 18/10/2026 14:00:42 Vietnam time. */
export const PREVIEW_NOW = new Date('2026-10-18T14:00:42+07:00');
export const TZ = 'Asia/Ho_Chi_Minh';
const NBSP = ' ';

/** `"dd/mm HH:MM[:SS]"` or `"HH:MM[:SS]"` (today) of data.js → Date (Vietnam time, year 2026). */
export function pvTime(s: string): Date {
  const [a, b] = s.includes(' ') ? s.split(' ') : ['18/10', s];
  const [d, m] = a!.split('/');
  const hms = b!.split(':');
  const [h, mi, se] = [hms[0], hms[1], hms[2] ?? '00'];
  return new Date(`2026-${m}-${d}T${h!.padStart(2, '0')}:${mi}:${se}+07:00`);
}
const addSec = (at: Date, s: number) => new Date(at.getTime() + s * 1000);

// ── hashes like design/preview/preview.js (uuid, sid) ─────────────────────
function hash32(str: string, seed: number): string {
  let h = 2166136261;
  for (const c of str) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  h ^= Math.imul(seed + 1, 0x9e3779b9);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function uuid(seed: string): string {
  const x = [0, 1, 2, 3].map((i) => hash32(seed, i * 7919)).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-4${x.slice(13, 16)}-a${x.slice(17, 20)}-${x.slice(20, 32)}`;
}
/** Claude Code session id of run #n (preview `sid`). */
export const sid = (key: string, n: number) => uuid(`${key}#${n}`);
/** Id of a run (`n` = run number; a skipped run: by its start time, in the data.js format). */
export const runId = (key: string, n: number | null, start: string) => uuid(`${key}run${n ?? `skip ${start}`}`);
/** Id of execution #k: the current / latest execution carries the id of data.js, the others as in preview `execDetail`. */
export function execId(key: string, k: number): string {
  const l = previewData().loops[key];
  return l?.exec && l.exec.k === k && l.exec.id ? l.exec.id : uuid(`${key}exec${k}`);
}
export const loopId = (key: string): string => previewData().loops[key].id;
export const repoId = (key: string): string => previewData().repos[key]!.id;

/** Folders of the sample repos present / missing as in the preview (D-UI11): send `POST /api/__test/dirs { paths }` after every reset. */
export function previewDirs(): Record<string, boolean> {
  const pv = previewData();
  return Object.fromEntries(Object.values(pv.repos).map((r) => [r.path, !r.gone]));
}

type FolderMachine = {
  platform: 'win32' | 'darwin';
  home: string;
  known?: { desktop?: string; documents?: string; downloads?: string };
  roots?: string[];
  volumes?: [string, string][];
  at: string;
  entries: [string, string][];
  denied?: string;
  repos?: Record<string, { id: string; name: string; path: string; added: string }>;
  repoOrder?: string[];
};
export type FolderWorldBody = {
  platform: 'win32' | 'darwin';
  home: string;
  known?: { desktop?: string; documents?: string; downloads?: string };
  dirs: string[];
  denied?: string[];
  links?: Record<string, string>;
};

/**
 * The "machine" of the Browse… dialog as in the preview (`data.js` PV.folders.win / .mac) → body of
 * `POST /api/__test/folders`: subfolders of `at` (`git` → adds `.git` inside), drives (Windows) / volumes under `/Volumes`
 * (Mac — the boot volume is a link to `/`), the default Desktop / Documents / Downloads of the Mac, folders that deny access.
 */
export function previewFolderWorld(kind: 'win' | 'mac'): FolderWorldBody {
  const m = (previewData() as unknown as { folders: Record<'win' | 'mac', FolderMachine> }).folders[kind];
  const sep = m.platform === 'win32' ? '\\' : '/';
  const dirs = m.entries.flatMap(([name, flag]) => (flag === 'git' ? [`${m.at}${sep}${name}${sep}.git`] : [`${m.at}${sep}${name}`]));
  const links: Record<string, string> = {};
  if (m.platform === 'win32') dirs.push(...(m.roots ?? []).map((r) => `${r}\\`));
  else {
    dirs.push(...['Desktop', 'Documents', 'Downloads'].map((d) => `${m.home}/${d}`));
    for (const [name, path] of m.volumes ?? []) {
      if (path === '/') links[`/Volumes/${name}`] = '/';
      else dirs.push(path);
    }
  }
  return {
    platform: m.platform,
    home: m.home,
    ...(m.known ? { known: m.known } : {}),
    dirs,
    ...(m.denied ? { denied: [m.denied] } : {}),
    ...(Object.keys(links).length ? { links } : {}),
  };
}

/** Repos of the Mac in the preview (its own console, Mac paths) → DB; their folders forced "present" through `/api/__test/dirs`. */
export async function seedMacRepos(db: pg.Pool): Promise<Record<string, boolean>> {
  const m = (previewData() as unknown as { folders: Record<'mac', FolderMachine> }).folders.mac;
  const dirs: Record<string, boolean> = {};
  for (const k of m.repoOrder ?? []) {
    const r = m.repos![k]!;
    await db.query('INSERT INTO repos (id, name, path, created_at) VALUES ($1,$2,$3,$4)', [r.id, r.name, r.path, pvTime(r.added)]);
    dirs[r.path] = true;
  }
  return dirs;
}

/** A duration with the English words of the console log lines, like preview `logDur()` (non-breaking spaces). */
function durText(sec: number): string {
  const fill = (key: 'dur.d' | 'dur.dh' | 'dur.h' | 'dur.hm' | 'dur.m' | 'dur.s', p: Record<string, number>) =>
    en[key].replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  const s = d ? (h ? fill('dur.dh', { d, h }) : fill('dur.d', { d })) : h ? (m ? fill('dur.hm', { h, m }) : fill('dur.h', { h })) : m ? fill('dur.m', { m }) : fill('dur.s', { s: sec });
  return s.replace(/ /g, NBSP);
}
const usd = (c: number) => `$${c.toFixed(2)}`;

type RunRow = {
  n: number | null;
  st: string;
  trig: 'start' | 'schedule';
  start: Date;
  /** Time text of data.js (for the `runId` of a skipped run). */
  startText: string;
  dur: number;
  cost: number | null;
  err: string | null;
  sum: string | null;
  reason?: number;
  repoGone?: boolean;
  /** Has log lines (a run the preview lists). */
  log: boolean;
};

/** Console log lines exactly like preview `claudeLines` (D-UI18). */
function claudeLines(key: string, l: Any, r: RunRow, repoPath: string): { at: Date; level: 'info' | 'error'; message: string }[] {
  if (r.repoGone) return [{ at: r.start, level: 'error', message: `Error · ${REPO_MISSING_PREFIX}${repoPath}` }];
  const L: { at: Date; level: 'info' | 'error'; message: string }[] = [{ at: r.start, level: 'info', message: `Start round #${r.n} · session ${sid(key, r.n!)}` }];
  const at = addSec(r.start, r.dur);
  if (r.st === 'succeeded') L.push({ at, level: 'info', message: `End · Succeeded · ${usd(r.cost ?? 0)}` });
  if (r.st === 'failed') {
    L.push({ at, level: 'error', message: `Error · ${r.err}` });
    if (r.cost !== null) L.push({ at, level: 'info', message: `End · Error · ${usd(r.cost)}` });
  }
  if (r.st === 'timed_out') L.push({ at, level: 'error', message: `End · Timed out (timeout ${l.timeout == null ? en['dur.unlimited'] : durText(l.timeout)}) · stop signal sent` });
  if (r.st === 'cancelled') L.push({ at, level: 'info', message: 'End · Cancelled (Stop) · stop signal sent' });
  return L;
}

const FAILURE = new Set(['failed', 'timed_out', 'interrupted']);
/** Skip reason as the preview prints it (`skip.reason` of the English UI). */
const skipReason = (n: number) => en['skip.reason'].replace('{n}', String(n));

/**
 * Runs of one execution: the runs the preview lists + runs added so the ✓ ✗ ⊘ ↷ of the execution add up. `lastIter` =
 * last run number of the execution (the number of the run in progress, if any).
 */
function executionRuns(key: string, e: Any, lastIter: number, running: boolean): RunRow[] {
  const pv = previewData();
  const l = pv.loops[key];
  const start = pvTime(e.start);
  const end = e.end ? pvTime(e.end) : PREVIEW_NOW;
  const pool: Any[] = key === 'pilot' && e.k === 2 ? pv.runs.pilotExec2! : (pv.runs[key] ?? []);
  const listed: RunRow[] = pool
    .filter((r) => {
      const t = pvTime(r.start);
      return t >= start && t <= end;
    })
    .map((r) => ({
      n: r.n,
      st: r.st,
      trig: r.trig,
      start: pvTime(r.start),
      startText: r.start,
      dur: r.dur ?? 0,
      cost: r.cost ?? null,
      err: r.repoGone ? `${REPO_MISSING_PREFIX}${pv.repos[l.repo]!.path}` : r.st === 'timed_out' ? `Timed out (${l.timeout} s) — cancelled` : (r.err ?? null),
      sum: r.sum ?? null,
      reason: r.reason,
      repoGone: !!r.repoGone,
      log: true,
    }));
  const [ok, err, cancel, skip] = e.counts as number[];
  const total = ok! + err! + cancel! + (running ? 1 : 0);
  const firstIter = lastIter - total + 1;
  const have = new Set(listed.filter((r) => r.n !== null).map((r) => r.n));
  const missing: number[] = [];
  for (let n = firstIter; n <= lastIter; n++) if (!have.has(n)) missing.push(n);

  // Statuses still missing compared with the counters of the execution.
  const left = {
    succeeded: ok! - listed.filter((r) => r.st === 'succeeded').length,
    failed: err! - listed.filter((r) => FAILURE.has(r.st)).length,
    cancelled: cancel! - listed.filter((r) => r.st === 'cancelled').length,
    skipped: skip! - listed.filter((r) => r.st === 'skipped').length,
  };
  // Durations of the added runs: the current execution has an "Avg per run" → chosen so the average matches it.
  const finishedListed = listed.filter((r) => r.st !== 'skipped' && r.st !== 'running');
  const isCurrent = l.exec && l.exec.k === e.k;
  let durs: number[] = missing.map(() => 60);
  if (isCurrent && l.avg && missing.length) {
    const rest = l.avg * l.finished - finishedListed.reduce((s, r) => s + r.dur, 0);
    const base = Math.floor(rest / missing.length);
    durs = missing.map((_, i) => base + (i < rest - base * missing.length ? 1 : 0));
  }
  // Times: the first run of the execution at Start; the later ones spread evenly up to the earliest listed run (or to
  // the moment the execution closed).
  const earliest = listed.length ? Math.min(...listed.map((r) => r.start.getTime())) : end.getTime();
  const span = earliest - start.getTime();
  const out: RunRow[] = [...listed];
  missing.forEach((n, i) => {
    const st = left.failed > 0 && i > 0 ? (left.failed--, 'failed') : left.cancelled > 0 && i > 0 ? (left.cancelled--, 'cancelled') : (left.succeeded--, 'succeeded');
    const at = i === 0 && n === firstIter ? start : new Date(start.getTime() + Math.floor((span * i) / missing.length));
    out.push({
      n,
      st,
      trig: i === 0 && n === firstIter ? 'start' : 'schedule',
      start: at,
      startText: '',
      dur: durs[i]!,
      cost: null,
      err: st === 'failed' ? 'Claude Code process exited with code 1' : null,
      sum: null,
      log: false,
    });
    if (left.skipped > 0 && i > 0) {
      left.skipped--;
      out.push({ n: null, st: 'skipped', trig: 'schedule', start: addSec(at, 1), startText: `${n}+1s`, dur: 0, cost: null, err: null, sum: null, reason: n, log: false });
    }
  });
  // Skipped runs still left (the execution only has listed runs) → after its first normal run.
  for (let i = 0; left.skipped > 0; i++, left.skipped--) {
    const after = out.find((r) => r.n === firstIter) ?? out[0]!;
    out.push({ n: null, st: 'skipped', trig: 'schedule', start: addSec(after.start, 2 + i), startText: `${firstIter}+${2 + i}s`, dur: 0, cost: null, err: null, sum: null, reason: after.n ?? firstIter, log: false });
  }
  return out;
}

/** Empties the data tables (in foreign-key order). The server keeps running — like `/api/__test/reset` but without HTTP. */
export async function wipe(db: pg.Pool): Promise<void> {
  await db.query('TRUNCATE run_logs, runs, loop_executions, loops, repos');
}

/** Writes the sample repos (`keys` empty = all 4) — registration time = the `added` column of data.js. */
export async function seedRepos(db: pg.Pool | pg.PoolClient, keys?: readonly string[]): Promise<void> {
  const pv = previewData();
  for (const k of keys ?? pv.repoOrder) {
    const r = pv.repos[k]!;
    await db.query('INSERT INTO repos (id, name, path, created_at) VALUES ($1,$2,$3,$4)', [r.id, r.name, r.path, pvTime(r.added)]);
  }
}

/** Creation time of a loop: the list sorts newest first (spec Q15) while the preview row order does not follow creation → step back one minute each. */
export function createdOf(): Record<string, Date> {
  const pv = previewData();
  const out: Record<string, Date> = {};
  let prev = Infinity;
  for (const key of pv.order) {
    let c = pvTime(pv.loops[key].created);
    if (c.getTime() >= prev) c = new Date(prev - 60_000);
    prev = c.getTime();
    out[key] = c;
  }
  out.oldsched = pvTime(pv.loops.oldsched.created);
  return out;
}

/**
 * Seeds the `list-overview` world (4 repos, 7 loops + 1 archived) into an empty DB. `history: true` adds the runs of the
 * older executions (detail screens). One transaction.
 */
export async function seedPreviewWorld(db: pg.Pool, opts: { history?: boolean } = {}): Promise<PreviewData> {
  const pv = previewData();
  const created = createdOf();
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await seedRepos(c);
    for (const key of [...pv.order, 'oldsched']) {
      const l = pv.loops[key];
      const config = { model: l.claude.model, effort: l.claude.effort };
      const repoPath = pv.repos[l.repo]!.path;
      await c.query(
        `INSERT INTO loops (id, name, description, prompt, cron, timezone, timeout_sec, executor_kind, executor_config, status, next_run_at,
                            run_counter, execution_counter, version, created_at, updated_at, archived_at, repo_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'claude',$8,$9,$10,$11,$12,1,$13,$14,$15,$16)`,
        [l.id, l.name, l.desc, l.prompt, l.cron, l.tz, l.timeout, config, l.status, l.next ? pvTime(l.next.at) : null, l.lifetime, l.execCount,
          created[key], pvTime(l.updated), l.archived ? pvTime(l.updated) : null, pv.repos[l.repo]!.id],
      );
      // Executions: newest first → the last run of the previous execution = the first run of the next one − 1.
      let lastIter = l.lifetime as number;
      for (const e of pv.executions[key] ?? []) {
        const eid = execId(key, e.k);
        await c.query('INSERT INTO loop_executions (id, loop_id, seq, started_at, ended_at, end_reason) VALUES ($1,$2,$3,$4,$5,$6)', [
          eid, l.id, e.k, pvTime(e.start), e.end ? pvTime(e.end) : null, e.st === 'active' ? null : e.st,
        ]);
        const current = l.exec && l.exec.k === e.k;
        const running = current && !!l.run;
        const runs = executionRuns(key, e, lastIter, running);
        lastIter -= runs.filter((r) => r.n !== null).length;
        if (!current && !opts.history) continue;
        for (const r of runs) await insertRun(c, key, l, eid, r, repoPath);
      }
    }
    await c.query('COMMIT');
  } catch (err) {
    await c.query('ROLLBACK');
    throw err;
  } finally {
    c.release();
  }
  return pv;
}

async function insertRun(c: pg.PoolClient, key: string, l: Any, eid: string, r: RunRow, repoPath: string): Promise<void> {
  const config = { model: l.claude.model, effort: l.claude.effort };
  const id = runId(key, r.n, r.startText || r.start.toISOString());
  // old prompt snapshot: run-succeeded (#68) + vi-run-transcript (#63) — the preview draws these two runs with oldPrompt
  const prompt = key === 'pilot' && (r.n === 68 || r.n === 63) ? l.promptOld : l.prompt;
  if (r.st === 'skipped') {
    await c.query(
      `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, skip_reason, scheduled_for, started_at, finished_at,
                         prompt_snapshot, executor_kind, executor_config)
       VALUES ($1,$2,$3,NULL,'schedule','skipped',$4,$5,$5,$5,$6,'claude',$7)`,
      [id, l.id, eid, skipReason(r.reason!), r.start, prompt, config],
    );
    return;
  }
  const running = r.st === 'running';
  const finished = running ? null : r.st === 'interrupted' ? pvTime(previewData().restartedAt) : addSec(r.start, r.dur);
  await c.query(
    `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, scheduled_for, started_at, deadline_at, finished_at,
                       duration_ms, prompt_snapshot, executor_kind, executor_config, summary, error, cost_usd, session_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'claude',$13,$14,$15,$16,$17)`,
    [id, l.id, eid, r.n, r.trig, r.st, r.trig === 'schedule' ? r.start : null, r.start, l.timeout == null ? null : addSec(r.start, l.timeout), finished,
      running ? null : r.dur * 1000, prompt, config, r.sum, r.err, r.cost, r.repoGone ? null : sid(key, r.n!)],
  );
  if (!r.log) return;
  const lines = claudeLines(key, l, r, repoPath);
  const values: unknown[] = [];
  const rows = lines.map((x, i) => {
    values.push(id, i + 1, x.at, x.level, x.message);
    const b = i * 5;
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
  });
  await c.query(`INSERT INTO run_logs (run_id, seq, at, level, message) VALUES ${rows.join(',')}`, values);
}

/**
 * Seeds the `list-many` world (UC-16: 12 loops, 10 runs in progress at once, very long names) + repos + 1 archived loop
 * for the Archived tab. The top bar of the preview contradicts itself in this state ("3 errors 24h" while the ✗ of the
 * open executions — all opened in the last 24 hours — add up to 4) → the visual test only compares the list pane.
 */
export async function seedPreviewMany(db: pg.Pool): Promise<PreviewData> {
  const pv = previewData();
  await seedRepos(db);
  const now = PREVIEW_NOW.getTime();
  const rows = pv.many;
  let seq = 0;
  const insertRunMany = async (loop: string, exec: string, n: number | null, status: string, startedAt: Date) => {
    seq++;
    const skipped = status === 'skipped';
    const running = status === 'running';
    await db.query(
      `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, skip_reason, scheduled_for, started_at, finished_at, duration_ms,
                         prompt_snapshot, executor_kind, executor_config, error, session_id)
       VALUES ($1,$2,$3,$4,'schedule',$5,$6,$7,$7,$8,$9,'p','claude','{}',$10,$11)`,
      [uuid(`many-run-${seq}`), loop, exec, n, status, skipped ? 'previous run still in progress' : null, startedAt, running ? null : skipped ? startedAt : addSec(startedAt, 20),
        running || skipped ? null : 20_000, status === 'failed' ? 'error' : null, skipped ? null : uuid(`many-sid-${seq}`)],
    );
  };
  for (let i = 0; i < rows.length; i++) {
    const [name, cron, n, el, ok, err, ca, sk, lastAt, nextAt, lastSt, k, up, repo] = rows[i] as [
      string, string, number | null, number | null, number, number, number, number, string, string | null, string, number, number, string,
    ];
    const id = uuid(`many:${i}`);
    const running = n !== null;
    const lastStart = pvTime(lastAt);
    const top = running ? n! : ok + err + ca;
    // The longest name of the preview (over 100 characters) is above the spec limit of 80 — cut to 80 (the row only shows
    // ~40 characters, then "…").
    await db.query(
      `INSERT INTO loops (id, name, description, prompt, cron, timezone, timeout_sec, executor_kind, executor_config, status, next_run_at,
                          run_counter, execution_counter, version, created_at, updated_at, archived_at, repo_id)
       VALUES ($1,$2,'',$3,$4,$5,1800,'claude','{"model":"sonnet","effort":"medium"}',$6,$7,$8,$9,1,$10,$11,NULL,$12)`,
      [id, [...name].slice(0, 80).join(''), `Task ${i + 1}`, cron, TZ, running ? 'active' : 'stopped', nextAt ? pvTime(nextAt) : null, top, k,
        new Date(now - 30 * 86_400_000 - i * 60_000), new Date(now - 86_400_000 * 9), pv.repos[repo]!.id],
    );
    const exId = uuid(`many:${i}:exec`);
    // An open execution started `up` seconds before now; a closed one ended 1 hour after its last run.
    const endedAt = running ? null : new Date(lastStart.getTime() + 3_600_000);
    const startedAt = new Date((endedAt ? endedAt.getTime() : now) - up * 1000);
    await db.query('INSERT INTO loop_executions (id, loop_id, seq, started_at, ended_at, end_reason) VALUES ($1,$2,$3,$4,$5,$6)', [
      exId, id, k, startedAt, endedAt, running ? null : 'stopped',
    ]);
    // The latest run (`lastSt` at `lastAt`), then the remaining succeeded / failed / cancelled runs going back one minute each.
    const statuses = [lastSt, ...Array(ok).fill('succeeded'), ...Array(err).fill('failed'), ...Array(ca).fill('cancelled')];
    statuses.splice(statuses.indexOf(lastSt, 1), 1);
    let it = running ? n! - 1 : top;
    for (let j = 0; j < statuses.length; j++) await insertRunMany(id, exId, it--, statuses[j]!, new Date(lastStart.getTime() - j * 60_000));
    for (let j = 0; j < sk; j++) await insertRunMany(id, exId, null, 'skipped', new Date(lastStart.getTime() + (j + 1) * 1000));
    if (running) await insertRunMany(id, exId, n!, 'running', new Date(now - el! * 1000));
  }
  const old = pv.loops.oldsched;
  await db.query(
    `INSERT INTO loops (id, name, description, prompt, cron, timezone, timeout_sec, executor_kind, executor_config, status, next_run_at,
                        run_counter, execution_counter, version, created_at, updated_at, archived_at, repo_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'claude','{"model":"haiku","effort":"low"}','stopped',NULL,0,0,1,$8,$9,$9,$10)`,
    [old.id, old.name, old.desc, old.prompt, old.cron, old.tz, old.timeout, pvTime(old.created), pvTime(old.updated), pv.repos[old.repo]!.id],
  );
  return pv;
}
