// One row of the loop list (UC-03) - pure functions from the API's `LoopDto` to exactly what the row shows, the way preview
// the phase 1 preview writes it (design/preview/preview.js `loopRow`). Iteration count, execution #k, latest / next run are taken VERBATIM from the API;
// the web only runs the clock between two loads: a running run = now - the run's start, an open execution =
// the `elapsedMs` the server counted when it answered + the time passed since the load (`fetchedAt`).
import type { LoopDto } from '../../../shared/contracts/loops';
import type { StatusKind } from '../../ui/components';
import { roundList } from '../loop-detail/format';

export type RowStatus =
  | { kind: 'stopping'; iteration: number }
  | { kind: 'running'; iteration: number; elapsedSec: number; count: number }
  | { kind: 'archived' }
  | { kind: 'idle' }
  | { kind: 'server_down' }
  | { kind: 'stopped' };

export type RowModel = {
  id: string;
  name: string;
  /** Repo name of the loop (D-UI15) - shown right after the loop name. */
  repoName: string;
  active: boolean;
  archived: boolean;
  status: RowStatus;
  cron: string;
  /** Current / latest execution; never started -> null. */
  execution: { seq: number; elapsedSec: number } | null;
  /** ✓ ✗ ⊘ ↷ of the execution - shown only while the loop is running (like the preview). */
  counts: { ok: number; err: number; cancel: number; skip: number } | null;
  /** Latest run that has a result: status + start time (the loop's time). */
  last: { status: StatusKind; at: string } | null;
  /** Next run (the loop's time). */
  next: string | null;
  /** Running iteration #N (newest) for the Stop confirm box - D-UI1; `count` / `list` = every running run. */
  activeRun: { iteration: number; elapsedSec: number; count: number; list: string } | null;
};

const sec = (ms: number) => Math.max(0, Math.floor(ms / 1000));

function parts(at: Date, timeZone: string) {
  const p = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(at);
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? '';
  return { day: `${get('day')}/${get('month')}`, year: get('year'), hm: `${get('hour')}:${get('minute')}` };
}

/** `13:30` on the same day as now (in the loop's time zone), another day -> `16/10 08:30`. */
export function shortWhen(at: Date, now: Date, timeZone: string): string {
  const a = parts(at, timeZone);
  const n = parts(now, timeZone);
  return a.day === n.day && a.year === n.year ? a.hm : `${a.day} ${a.hm}`;
}

export function rowModel(loop: LoopDto, now: Date, fetchedAt: number, stopping: boolean): RowModel {
  const ex = loop.currentExecution;
  const run = loop.activeRun;
  const active = loop.status === 'active';
  const archived = loop.archivedAt !== null;
  const runElapsed = run ? sec(now.getTime() - run.startedAt.getTime()) : 0;
  const exElapsed = ex ? sec(ex.stats.elapsedMs + (ex.endedAt ? 0 : now.getTime() - fetchedAt)) : 0;
  let status: RowStatus;
  if (stopping && run?.iteration != null) status = { kind: 'stopping', iteration: run.iteration };
  else if (run?.iteration != null) status = { kind: 'running', iteration: run.iteration, elapsedSec: runElapsed, count: loop.activeRuns.length };
  else if (archived) status = { kind: 'archived' };
  else if (active) status = { kind: 'idle' };
  else if (ex?.endReason === 'server_down') status = { kind: 'server_down' };
  else status = { kind: 'stopped' };
  return {
    id: loop.id,
    name: loop.name,
    repoName: loop.repo.name,
    active,
    archived,
    status,
    cron: loop.cron,
    execution: ex ? { seq: ex.seq, elapsedSec: exElapsed } : null,
    counts: active && ex ? { ok: ex.stats.succeeded, err: ex.stats.failed, cancel: ex.stats.cancelled, skip: ex.stats.skipped } : null,
    last: loop.lastRun ? { status: loop.lastRun.status, at: shortWhen(loop.lastRun.startedAt, now, loop.timezone) } : null,
    next: loop.nextRunAt ? shortWhen(loop.nextRunAt, now, loop.timezone) : null,
    activeRun: run?.iteration != null ? { iteration: run.iteration, elapsedSec: runElapsed, count: loop.activeRuns.length, list: roundList(loop.activeRuns) } : null,
  };
}
