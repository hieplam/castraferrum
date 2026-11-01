import { DomainError } from '../../shared/domain/errors';
import type { LogLevel, RunTrigger } from '../../shared/domain/run';
import type { ActiveRunRegistry } from '../ports/active-runs';
import type { Clock } from '../ports/clock';
import type { EventPublisher } from '../ports/events';
import type { ExecutorRegistry, LoopExecutor } from '../ports/executor';
import type { IdGenerator } from '../ports/ids';
import type { Page, PageRequest } from '../ports/page';
import type { Repositories } from '../ports/repositories';
import type { LogLine } from '../ports/run-log-repository';
import type { RunOutcome, RunRecord } from '../ports/run-repository';
import type { RunService, RunView } from './contracts';

export type RunServiceDeps = Pick<Repositories, 'repos' | 'loops' | 'executions' | 'runs' | 'logs'> & {
  executors: ExecutorRegistry;
  active: ActiveRunRegistry;
  clock: Clock;
  ids: IdGenerator;
  events: EventPublisher;
};

const LOG_PAGE = 1000;

/**
 * One run (ARCHITECTURE.md § One run): the DB grants the run (a partial unique index blocks overlapping runs) → run the executor in the background,
 * pull events with `for await` (no callback handed to the executor to call back) → record session / log → `finish`.
 * Cancelling (Stop, overdue) writes the result to the DB IMMEDIATELY and only then signals the executor — in the DB "first one wins", so the result
 * does not depend on whether the executor listens to the signal. Calls no other service.
 */
export class DefaultRunService implements RunService {
  readonly #d: RunServiceDeps;
  /** Runs going in the background inside this service. */
  readonly #inflight = new Set<Promise<void>>();
  /** Runs whose result is being written — stops two places (cancel + executor reporting done) from both emitting `run.finished`. */
  readonly #finishing = new Set<string>();

  constructor(deps: RunServiceDeps) {
    this.#d = deps;
  }

  startFirst(loopId: string, executionId: string): Promise<RunView> {
    return this.#begin(loopId, executionId, 'start', null);
  }

  startScheduled(loopId: string, executionId: string, scheduledFor: Date): Promise<RunView> {
    return this.#begin(loopId, executionId, 'schedule', scheduledFor);
  }

  startClaimed(loopId: string, executionId: string, claim: { runId: string; taskKey: string }): Promise<RunView> {
    return this.#begin(loopId, executionId, 'probe', null, claim);
  }

  async cancel(runId: string, reason: 'cancelled' | 'timed_out'): Promise<RunView> {
    const d = this.#d;
    const run = await d.runs.findById(runId);
    if (!run) throw new DomainError('RUN_NOT_FOUND', `No run ${runId}`);
    if (run.status !== 'running') return run;
    d.active.abort(runId, reason); // false = the run is not running in this process → only the DB needs writing
    const message =
      reason === 'cancelled' ? 'Cancelled (Stop)' : `Timed out (${timeoutSecOf(run)} seconds) - cancelled`;
    await this.#log(run, 'warn', message);
    const done = await this.#finish(run, {
      status: reason,
      finishedAt: d.clock.now(),
      error: reason === 'timed_out' ? message : null,
    });
    return done ?? (await this.get(runId));
  }

  async expireOverdue(): Promise<number> {
    const overdue = await this.#d.runs.findOverdue(this.#d.clock.now());
    let n = 0;
    for (const run of overdue) {
      const done = await this.cancel(run.id, 'timed_out');
      if (done.status === 'timed_out') n++;
    }
    return n;
  }

  async get(runId: string): Promise<RunView> {
    const run = await this.#d.runs.findById(runId);
    if (!run) throw new DomainError('RUN_NOT_FOUND', `No run ${runId}`);
    return run;
  }

  async listByLoop(loopId: string, page: PageRequest): Promise<Page<RunView>> {
    if (!(await this.#d.loops.findById(loopId))) throw new DomainError('LOOP_NOT_FOUND', `No loop ${loopId}`);
    return this.#d.runs.listByLoop(loopId, page);
  }

  async logs(runId: string, afterSeq: number): Promise<LogLine[]> {
    await this.get(runId);
    const out: LogLine[] = [];
    for (let after = afterSeq; ; ) {
      const page = await this.#d.logs.list(runId, after, LOG_PAGE);
      out.push(...page);
      if (page.length < LOG_PAGE) return out;
      after = page.at(-1)!.seq;
    }
  }

  /** Wait for every background run of this service to finish (tests; graceful server shutdown). */
  async settled(): Promise<void> {
    while (this.#inflight.size > 0) await Promise.allSettled([...this.#inflight]);
  }

  // ---------------------------------------------------------------- internals

  async #begin(
    loopId: string,
    executionId: string,
    trigger: RunTrigger,
    scheduledFor: Date | null,
    claim: { runId: string; taskKey: string } | null = null,
  ): Promise<RunView> {
    const d = this.#d;
    const loop = await d.loops.findById(loopId);
    if (!loop) throw new DomainError('LOOP_NOT_FOUND', `No loop ${loopId}`);
    // `cwd` is snapshotted when the run starts (SPEC-phase-2): editing / changing the loop's repo afterwards only applies from the next run.
    const repo = await d.repos.findById(loop.repoId);
    if (!repo) throw new Error(`Loop ${loopId} points at repo ${loop.repoId} which does not exist (the foreign key should prevent this)`);
    const now = d.clock.now();
    const snapshot = { promptSnapshot: loop.prompt, executorKind: loop.executorKind, executorConfig: loop.executorConfig };
    // A claimed run keeps the id that its claim row already holds, also when the row becomes `skipped`.
    const runId = claim?.runId ?? d.ids.newId();
    const taskKey = claim?.taskKey ?? null;
    const res = await d.runs.start({
      id: runId,
      loopId,
      executionId,
      trigger,
      scheduledFor,
      startedAt: now,
      // Unlimited → no deadline: expireOverdue never picks this run (UC-24).
      deadlineAt: loop.timeoutSec === null ? null : new Date(now.getTime() + loop.timeoutSec * 1000),
      taskKey,
      ...snapshot,
    });
    if (res.kind === 'busy') {
      // N runs already going — the DB refused, record a "skipped" row.
      const skipReason = skipReasonOf(res.active, res.limit);
      const skipped = await d.runs.recordSkipped({ id: runId, trigger: claim ? 'probe' : undefined, taskKey, loopId, executionId, scheduledFor, at: now, skipReason, ...snapshot });
      d.events.publish({ type: 'run.skipped', at: now, loopId, executionId, runId: skipped.id, reason: skipReason });
      return skipped;
    }
    const run = res.run;
    // Register BEFORE any further await: a Stop sneaking in right now can still cancel the run.
    const controller = new AbortController();
    d.active.register(run.id, controller);
    d.events.publish({ type: 'run.started', at: now, loopId, executionId, runId: run.id, iteration: run.iteration ?? 0 });

    // The execution was closed between the tick picking up the due loop and the run starting (a Stop sneaked in) → cancel at once.
    const open = await d.executions.findOpen(loopId);
    if (open?.id !== executionId) {
      const done = await this.cancel(run.id, 'cancelled');
      d.active.release(run.id);
      return done;
    }
    if (controller.signal.aborted) {
      d.active.release(run.id);
      return this.get(run.id);
    }
    const executor = d.executors.find(run.executorKind);
    if (!executor) {
      d.active.release(run.id);
      const error = `No such executor "${run.executorKind}"`;
      await this.#log(run, 'error', error);
      return (await this.#finish(run, { status: 'failed', finishedAt: d.clock.now(), error })) ?? this.get(run.id);
    }
    const p = this.#drive(run, executor, controller, repo.path)
      .catch(() => {
        // DB broke mid-run: the run left `running` will be cancelled by expireOverdue at the deadline, or by recovery at startup.
      })
      .finally(() => this.#inflight.delete(p));
    this.#inflight.add(p);
    return run;
  }

  async #drive(run: RunRecord, executor: LoopExecutor, controller: AbortController, cwd: string): Promise<void> {
    const d = this.#d;
    const signal = controller.signal;
    let outcome: Omit<RunOutcome, 'finishedAt'> | null = null;
    let thrown: string | null = null;
    try {
      const input = {
        runId: run.id,
        loopId: run.loopId,
        executionId: run.executionId,
        iteration: run.iteration ?? 0,
        prompt: run.promptSnapshot,
        config: run.executorConfig,
        cwd,
      };
      for await (const ev of executor.execute(input, signal)) {
        if (signal.aborted) break; // already cancelled: the result is in the DB, drop the rest
        if (ev.type === 'session') await d.runs.setSession(run.id, ev.sessionId);
        else if (ev.type === 'log') await this.#log(run, ev.level, ev.message, ev.data);
        else {
          outcome =
            ev.outcome === 'succeeded'
              ? { status: 'succeeded', summary: ev.summary ?? null, costUsd: ev.costUsd ?? null, endResult: ev.end?.result ?? null, endPr: ev.end?.pr ?? null }
              : { status: 'failed', summary: ev.summary ?? null, error: ev.error ?? 'Unknown error', costUsd: ev.costUsd ?? null };
          break; // `result` is the last event
        }
      }
      if (!signal.aborted && !outcome) thrown = 'The executor ended without reporting a result';
    } catch (err) {
      if (!signal.aborted) thrown = err instanceof Error ? err.message : String(err);
    } finally {
      d.active.release(run.id);
    }
    if (signal.aborted) return;
    if (thrown !== null) {
      await this.#log(run, 'error', thrown);
      outcome = { status: 'failed', error: thrown };
    }
    if (outcome) await this.#finish(run, { ...outcome, finishedAt: d.clock.now() });
  }

  /** Record the result; only the place that really changed the run (DB: first one wins) emits `run.finished`. */
  async #finish(run: RunRecord, outcome: RunOutcome): Promise<RunRecord | null> {
    if (this.#finishing.has(run.id)) return null;
    this.#finishing.add(run.id);
    try {
      const done = await this.#d.runs.finish(run.id, outcome);
      if (done.status === outcome.status && done.finishedAt?.getTime() === outcome.finishedAt.getTime()) {
        this.#d.events.publish({
          type: 'run.finished',
          at: outcome.finishedAt,
          loopId: run.loopId,
          executionId: run.executionId,
          runId: run.id,
          status: done.status,
        });
      }
      return done;
    } finally {
      this.#finishing.delete(run.id);
    }
  }

  async #log(run: RunRecord, level: LogLevel, message: string, data?: unknown): Promise<void> {
    const at = this.#d.clock.now();
    const [line] = await this.#d.logs.append(run.id, [{ at, level, message, data }]);
    if (line) this.#d.events.publish({ type: 'run.log', at, loopId: run.loopId, runId: run.id, line });
  }
}

/** N = 1 keeps the exact wording of UC-12; N > 1 names N and the rounds still running, oldest first (SPEC-phase-2 § Running N runs in parallel). */
export function skipReasonOf(active: RunRecord[], limit: number): string {
  const rounds = active.map((r) => `#${r.iteration ?? '?'}`).join(', ');
  return limit <= 1 ? `round ${rounds} still running` : `${limit} parallel runs already going (rounds ${rounds} still running)`;
}

function timeoutSecOf(run: RunRecord): number {
  return run.deadlineAt ? Math.round((run.deadlineAt.getTime() - run.startedAt.getTime()) / 1000) : 0;
}
