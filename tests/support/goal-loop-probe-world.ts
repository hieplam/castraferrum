// The world of the probe states (goal G28): the sample `goalLoop` of design/ds/preview/data.js, built for real. The loop "Billing epic
// worker" gets its active periods, its runs, a probe row in the state that the test asks for (`waiting`, `blocked`, `held` or
// `complete`) and, for `held`, the open hold `plan-window`, the held run 28 with its session and its transcript. The loop page of this
// world must equal the approved probe shots, and the run page of run 28 must equal `run-held`.
import { join } from 'node:path';
import type pg from 'pg';
import { writeSessionTranscript } from './preview-transcripts';
import { DS_DATA_JS, PREVIEW_NOW, previewData, previewDirs, pvTime, repoId, seedPreviewWorld, sid, uuid } from './preview-world';
import type { TestApi } from './goal-loop-score-world';

export type ProbeSeedState = 'waiting' | 'blocked' | 'held' | 'complete';

/** The loop key of the sample, as the preview names it: the page of state `held` is the loop `probe-held`. */
const keyOf = (state: ProbeSeedState) => `probe-${state}`;

/** The blocking issues of the approved `probe-blocked` shot: the key, the title and the tasks each one blocks. The link is `https://github.com/hieplam/tribe/issues/<key>`. */
const BLOCKERS = [
  { key: '31', title: 'Migration 14 fails', blocks: 3 },
  { key: '33', title: 'The check on main is red', blocks: 5 },
];

/**
 * The line of the sample with the key `blockers` after `issues` (decision 52). The page shows the line again without that key, so what
 * it shows equals the `line` of data.js.
 */
function blockedLine(line: string): string {
  const object = JSON.parse(line) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(object)) {
    out[k] = v;
    if (k === 'issues') out.blockers = BLOCKERS.map((b) => ({ ...b, url: `https://github.com/hieplam/tribe/issues/${b.key}` }));
  }
  return JSON.stringify(out);
}

/** Run #23 stays out of every shot ("Show 1 more run"), so its time makes the five finished runs average 40:18 as the approved figures say. */
const RUN_23_DURATION = 4518;

/** The seeded probe is never due while the server clock is this far before the preview time: no tick of the live ticker touches the seed. */
const SERVER_CLOCK_BACK_MS = 24 * 3600_000;

type Sample = { n: number; st: string; trig: string; start: string; dur: number; cost: number | null; sum?: string; err?: string };

/**
 * Resets the console, sets its clock to `PREVIEW_NOW`, seeds the world of the preview, then builds the loop of `goalLoop` in `state`.
 * Returns the path of the loop page and of the page of run 28 (the held run; `null` in the other states). `projectsDir` = the
 * `projects` folder of the test server's `CLAUDE_CONFIG_DIR`: `held` writes the transcript of run 28 there.
 */
export async function seedProbeState(
  sp: TestApi,
  db: pg.Pool,
  state: ProbeSeedState,
  opts: { projectsDir?: string } = {},
): Promise<{ path: string; runPath: string | null }> {
  const ok = (r: { status: number }) => {
    if (r.status >= 300) throw new Error(`test route answered ${r.status}`);
  };
  ok(await sp.api('POST', '/api/__test/reset'));
  ok(await sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() }));
  ok(await sp.api('POST', '/api/__test/dirs', { paths: previewDirs(DS_DATA_JS) }));
  await seedPreviewWorld(db, {}, DS_DATA_JS);

  const gl = (previewData(DS_DATA_JS) as unknown as { goalLoop: unknown }).goalLoop as {
    loop: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    executions: { k: number; start: string; end: string | null }[];
    runs: Sample[];
    states: Record<string, Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
    transcript: { at: string; kind: string; text: string; tool?: string }[];
    heldLog: string;
  };
  const l = gl.loop;
  const p = gl.states[state]!;
  const key = keyOf(state);
  const held = state === 'held';
  const complete = state === 'complete';
  const config = { model: l.claude.model, effort: l.claude.effort };
  const heldRun = held ? (p.run as Sample) : null;

  await db.query(
    `INSERT INTO loops (id, name, description, prompt, cron, timezone, timeout_sec, executor_kind, executor_config, status, next_run_at,
                        run_counter, execution_counter, version, created_at, updated_at, archived_at, repo_id)
     VALUES ($1,$2,$3,$4,'0 0 1 1 *',$5,$6,'claude',$7,$8,NULL,$9,$10,1,$11,$12,NULL,$13)`,
    [l.id, l.name, l.desc, l.prompt, l.tz, l.timeout, config, complete ? 'stopped' : 'active', held ? 28 : l.lifetime, l.execCount, pvTime(l.created), pvTime(l.updated), repoId(l.repo, DS_DATA_JS)],
  );
  // Period 4 is the active one (closed by the goal in `complete`); period 3 ended by a Stop.
  for (const e of gl.executions) {
    const ended = e.k === 4 ? (complete ? pvTime(p.endedAt) : null) : pvTime(e.end!);
    await db.query('INSERT INTO loop_executions (id, loop_id, seq, started_at, ended_at, end_reason) VALUES ($1,$2,$3,$4,$5,$6)', [
      loopExecId(l, e.k),
      l.id,
      e.k,
      pvTime(e.start),
      ended,
      ended === null ? null : e.k === 4 ? 'goal_met' : 'stopped',
    ]);
  }
  const exec4 = loopExecId(l, 4);
  const exec3 = loopExecId(l, 3);

  // The hold first: the hold service resumes a held run while no `plan-window` hold is open.
  if (held) {
    await db.query('INSERT INTO resource_holds (id, resource, reason, opened_at, "until", opened_by_run_id) VALUES ($1,$2,$3,$4,$5,$6)', [
      uuid(`${key}hold`),
      p.resource,
      'The usage limit is reached.',
      pvTime(`18/10 ${p.openedAt}:00`),
      new Date('2026-10-18T19:00:00+07:00'),
      uuid(`${key}run${(p.run as Sample).n}`),
    ]);
  }

  const insertRun = async (r: Sample, executionId: string, status = r.st) => {
    const start = pvTime(r.start);
    const dur = r.n === 23 ? RUN_23_DURATION : r.dur;
    const finished = status === 'held' ? null : new Date(start.getTime() + dur * 1000);
    await db.query(
      `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, scheduled_for, started_at, deadline_at, finished_at, duration_ms,
                         prompt_snapshot, executor_kind, executor_config, summary, error, cost_usd, session_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,$11,'claude',$12,$13,$14,$15,$16)`,
      [uuid(`${key}run${r.n}`), l.id, executionId, r.n, r.trig, status, r.trig === 'schedule' ? start : null, start, finished, dur * 1000, l.prompt, config, r.sum ?? null, r.err ?? null, r.cost, sid(key, r.n)],
    );
  };
  for (const r of gl.runs) await insertRun(r, exec4);
  if (heldRun) await insertRun(heldRun, exec4, 'held');
  // The six runs of period 3, then the runs of earlier periods that the loop page only counts ("All 27 runs"): 16 skipped turns.
  const t3 = pvTime(gl.executions[1]!.start).getTime();
  for (let i = 0; i < 6; i++) {
    const start = new Date(t3 + i * 45 * 60_000);
    await insertRun({ n: 17 + i, st: 'succeeded', trig: 'schedule', start: isoLocal(start), dur: 2400, cost: 3, sum: `Task ${17 + i} is done.` }, exec3);
  }
  for (let i = 0; i < 16; i++) {
    const at = new Date(t3 + (6 * 45 + i + 1) * 60_000);
    await db.query(
      `INSERT INTO runs (id, loop_id, execution_id, iteration, trigger, status, skip_reason, scheduled_for, started_at, finished_at, prompt_snapshot, executor_kind, executor_config)
       VALUES ($1,$2,$3,NULL,'schedule','skipped',$4,$5,$5,$5,$6,'claude',$7)`,
      [uuid(`${key}skip${i}`), l.id, exec3, 'The probe skipped this turn.', at, l.prompt, config],
    );
  }

  const line = state === 'blocked' ? blockedLine(p.line) : (p.line as string);
  await db.query(
    `INSERT INTO loop_probes (loop_id, command, claim, release, resources, lane_env, lane_base_port, restart_policy, state, last_line, last_probe_at)
     VALUES ($1,$2,'[]','[]','[]','{}',NULL,'stop',$3,$4,$5)`,
    [l.id, JSON.stringify(['node', 'probe.mjs']), state, line, pvTime(`18/10 ${p.at}`)],
  );

  let runPath: string | null = null;
  if (held && heldRun) {
    const runId = uuid(`${key}run${heldRun.n}`);
    runPath = `/runs/${runId}`;
    // The console log of the held run: the Start line, then the Held line.
    const at = (s: number) => new Date(pvTime(heldRun.start).getTime() + s * 1000);
    const logs: [number, Date, string, string][] = [
      [1, at(0), 'info', `Start round #${heldRun.n} · session ${sid(key, heldRun.n)}`],
      [2, at(heldRun.dur), 'info', gl.heldLog],
    ];
    for (const [seq, when, level, message] of logs) await db.query('INSERT INTO run_logs (run_id, seq, at, level, message) VALUES ($1,$2,$3,$4,$5)', [runId, seq, when, level, message]);
    if (opts.projectsDir) writeSessionTranscript(join(opts.projectsDir), sid(key, heldRun.n), gl.transcript);
  }
  // The server clock leaves PREVIEW_NOW (the browser clock stays there): the ticker of the real server probes the seeded loop once the
  // clock is 60 s past its last probe, and that tick would replace the seeded state and the time of the last probe (issue 421).
  ok(await sp.api('POST', '/api/__test/clock', { at: new Date(PREVIEW_NOW.getTime() - SERVER_CLOCK_BACK_MS).toISOString() }));
  return { path: `/loops/${l.id}`, runPath };
}

/** Id of active period `k` of the sample loop (it has no `exec.id` for period 3). */
function loopExecId(l: Record<string, any>, k: number): string { // eslint-disable-line @typescript-eslint/no-explicit-any
  return l.exec.k === k && l.exec.id ? l.exec.id : uuid(`${l.id}exec${k}`);
}

/** `DD/MM HH:MM:SS` of a date in Vietnam time, the format of data.js. */
function isoLocal(d: Date): string {
  const v = new Date(d.getTime() + 7 * 3600_000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(v.getUTCDate())}/${p2(v.getUTCMonth() + 1)} ${p2(v.getUTCHours())}:${p2(v.getUTCMinutes())}:${p2(v.getUTCSeconds())}`;
}
