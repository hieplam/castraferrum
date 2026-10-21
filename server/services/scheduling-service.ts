import type { Clock } from '../ports/clock';
import type { Repositories } from '../ports/repositories';
import type { RunService, SchedulingService, TickReport } from './contracts';
import { nextRunAfter } from './loop-input';

export type SchedulingServiceDeps = Pick<Repositories, 'loops' | 'heartbeat'> & {
  /** Only calls down into RunService (through the interface). */
  runService: RunService;
  clock: Clock;
  /** Defaults to 10 seconds (D9: the `server_down` endedAt error is at most 10 seconds). */
  heartbeatEveryMs?: number;
  /** Number of due loops handled per tick; the rest wait for the next tick. Defaults to 50. */
  batch?: number;
};

/**
 * The scheduler tick (ARCHITECTURE.md § Scheduler tick), called by the scheduler layer every second: heartbeat → overdue runs → due loops.
 * The next run is computed FROM NOW (not from the old mark), so a machine waking from sleep runs just one run and does not pile up the missed ticks.
 * A run's deadline lives in the DB (`deadline_at`) and is checked only here — no `setTimeout` (D4).
 */
export class DefaultSchedulingService implements SchedulingService {
  readonly #d: SchedulingServiceDeps;
  readonly #heartbeatEveryMs: number;
  readonly #batch: number;
  #lastBeat: number | null = null;
  #busy = false;

  constructor(deps: SchedulingServiceDeps) {
    this.#d = deps;
    this.#heartbeatEveryMs = deps.heartbeatEveryMs ?? 10_000;
    this.#batch = deps.batch ?? 50;
  }

  async tick(): Promise<TickReport> {
    const d = this.#d;
    const now = d.clock.now();
    const report: TickReport = { at: now, ran: false, heartbeat: false, timedOut: 0, started: [], skipped: [], errors: [] };
    if (this.#busy) return report; // the previous tick has not finished (slow DB) → drop this tick, no overlap
    this.#busy = true;
    try {
      report.ran = true;
      if (this.#lastBeat === null || now.getTime() - this.#lastBeat >= this.#heartbeatEveryMs) {
        await d.heartbeat.beat(now);
        this.#lastBeat = now.getTime();
        report.heartbeat = true;
      }
      report.timedOut = await d.runService.expireOverdue(); // UC-13
      for (const loop of await d.loops.findDue(now, this.#batch)) {
        try {
          const next = nextRunAfter(loop.cron, loop.timezone, now);
          // Compare-and-set: the loop was Stopped / rescheduled at the same time → skip it, the next tick recomputes.
          if (!(await d.loops.advanceNextRun(loop.id, loop.nextRunAt, next))) continue;
          const run = await d.runService.startScheduled(loop.id, loop.openExecutionId, loop.nextRunAt);
          (run.status === 'skipped' ? report.skipped : report.started).push(run.id); // UC-12: skipped
        } catch (err) {
          report.errors.push({ loopId: loop.id, message: err instanceof Error ? err.message : String(err) });
        }
      }
      return report;
    } finally {
      this.#busy = false;
    }
  }
}
