import { DomainError } from '../../shared/domain/errors';
import { claimedLine, RESERVED_RESOURCE, RESUME_LINE, USAGE_LIMIT_END } from '../../shared/domain/goal-loop';
import { parseToolProfile } from '../../shared/domain/review-guard';
import type { LogLevel, RunTrigger } from '../../shared/domain/run';
import type { ActiveRunRegistry } from '../ports/active-runs';
import type { Clock } from '../ports/clock';
import type { EventPublisher } from '../ports/events';
import type { ExecutionEvent, ExecutorRegistry, LoopExecutor } from '../ports/executor';
import type { IdGenerator } from '../ports/ids';
import type { LoopRecord } from '../ports/loop-repository';
import type { Notifier } from '../ports/notifier';
import type { Page, PageRequest } from '../ports/page';
import type { Repositories } from '../ports/repositories';
import type { LogLine } from '../ports/run-log-repository';
import type { RunOutcome, RunRecord } from '../ports/run-repository';
import type { ClaimedStart, RunService, RunView } from './contracts';
import { openHold } from './hold-open';

export type RunServiceDeps = Pick<Repositories, 'repos' | 'loops' | 'executions' | 'runs' | 'logs' | 'holds'> & {
  executors: ExecutorRegistry;
  active: ActiveRunRegistry;
  clock: Clock;
  ids: IdGenerator;
  events: EventPublisher;
  notifier: Notifier;
};

type UsageLimit = Extract<ExecutionEvent, { type: 'usage_limit' }>;
type DriveOutcome = Omit<RunOutcome, 'finishedAt'>;

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

  startClaimed(loopId: string, executionId: string, claim: ClaimedStart): Promise<RunView> {
    return this.#begin(loopId, executionId, 'probe', null, claim);
  }

  async cancel(runId: string, reason: 'cancelled' | 'timed_out'): Promise<RunView> {
    const d = this.#d;
    const run = await d.runs.findById(runId);
    if (!run) throw new DomainError('RUN_NOT_FOUND', `No run ${runId}`);
    if (run.status !== 'running' && run.status !== 'held') return run;
    d.active.abort(runId, reason); // false = no process of this run in this process (a held run has none) → only the DB needs writing
    const message =
      reason === 'cancelled' ? 'Cancelled (Stop)' : `Timed out (${await this.#timeoutSec(run)} seconds) - cancelled`;
    await this.#log(run, 'warn', message);
    const done = await this.#finish(run, {
      status: reason,
      finishedAt: d.clock.now(),
      error: reason === 'timed_out' ? message : null,
      costUsd: run.costUsd, // `finish` replaces the cost, so a run that was held must pass its stored cost (decision 28)
    });
    return done ?? (await this.get(runId));
  }

  async resumeHeld(runId: string, { env, gateGuard }: { env: Record<string, string>; gateGuard?: boolean }): Promise<RunView> {
    const d = this.#d;
    const held = await this.get(runId);
    if (held.status !== 'held' || !held.sessionId) return held;
    // Each read comes before `resume`: a missing dependency throws here, and the run stays held for the next tick.
    const loop = await d.loops.findById(held.loopId);
    if (!loop) throw new DomainError('LOOP_NOT_FOUND', `No loop ${held.loopId}`);
    const repo = await d.repos.findById(loop.repoId);
    if (!repo) throw new Error(`Loop ${loop.id} points at repo ${loop.repoId} which does not exist (the foreign key should prevent this)`);
    const now = d.clock.now();
    const run = await d.runs.resume(runId, deadlineOf(loop, now));
    if (!run) return this.get(runId); // a Stop came first
    d.events.publish({ type: 'loop.updated', at: now, loopId: run.loopId });
    return this.#launch(run, repo.path, env, held.sessionId, gateGuard);
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
    claim: ClaimedStart | null = null,
  ): Promise<RunView> {
    const d = this.#d;
    const loop = await d.loops.findById(loopId);
    if (!loop) throw new DomainError('LOOP_NOT_FOUND', `No loop ${loopId}`);
    // `cwd` is snapshotted when the run starts (SPEC-phase-2): editing / changing the loop's repo afterwards only applies from the next run.
    const repo = await d.repos.findById(loop.repoId);
    if (!repo) throw new Error(`Loop ${loopId} points at repo ${loop.repoId} which does not exist (the foreign key should prevent this)`);
    const now = d.clock.now();
    // A claimed run starts with the line that tells the model which task is its own (spec 2.7). A run with no probe keeps the loop prompt.
    const head = claim
      ? [claimedLine(claim.taskKey, claim.action), ...(claim.failing?.length ? [`Failing goal rows: ${claim.failing.join(', ')}.`] : [])].join('\n')
      : null;
    const promptSnapshot = head ? `${head}\n\n${loop.prompt}` : loop.prompt;
    const snapshot = { promptSnapshot, executorKind: loop.executorKind, executorConfig: loop.executorConfig };
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
      deadlineAt: deadlineOf(loop, now),
      taskKey,
      slot: claim?.slot ?? null,
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
    d.events.publish({ type: 'run.started', at: now, loopId, executionId, runId: run.id, iteration: run.iteration ?? 0 });
    return this.#launch(run, repo.path, claim?.env, undefined, claim?.gateGuard);
  }

  /** From a `running` row to a run in the background. `#begin` and `resumeHeld` share it, so a Stop reaches a resumed run like a new one. */
  async #launch(run: RunRecord, cwd: string, env?: Record<string, string>, resumeSessionId?: string, gateGuard = false): Promise<RunView> {
    const d = this.#d;
    // Register BEFORE any further await: a Stop sneaking in right now can still cancel the run.
    const controller = new AbortController();
    d.active.register(run.id, controller);

    // The execution was closed between the tick picking up the due loop and the run starting (a Stop sneaked in) → cancel at once.
    const open = await d.executions.findOpen(run.loopId);
    if (open?.id !== run.executionId) {
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
      return (await this.#finish(run, { status: 'failed', finishedAt: d.clock.now(), error, costUsd: run.costUsd })) ?? this.get(run.id);
    }
    const profile = parseToolProfile(env?.CASTRAFERRUM_TOOL_PROFILE); // from the env, so a resume keeps the profile of the run
    if (profile === null) {
      d.active.release(run.id);
      const error = `Unknown tool profile "${env?.CASTRAFERRUM_TOOL_PROFILE}"`;
      await this.#log(run, 'error', error);
      return (await this.#finish(run, { status: 'failed', finishedAt: d.clock.now(), error, costUsd: run.costUsd })) ?? this.get(run.id);
    }
    const p = this.#drive(run, executor, controller, cwd, env, resumeSessionId, profile, gateGuard)
      .catch(() => {
        // DB broke mid-run: the run left `running` will be cancelled by expireOverdue at the deadline, or by recovery at startup.
      })
      .finally(() => this.#inflight.delete(p));
    this.#inflight.add(p);
    return run;
  }

  async #drive(run: RunRecord, executor: LoopExecutor, controller: AbortController, cwd: string, env?: Record<string, string>, resumeSessionId?: string, profile: 'full' | 'review' = 'full', gateGuard = false): Promise<void> {
    const d = this.#d;
    const signal = controller.signal;
    let outcome: DriveOutcome | null = null;
    let limit: UsageLimit | null = null;
    let resourceDown: string | null = null;
    let sessionId = run.sessionId;
    let thrown: string | null = null;
    try {
      const input = {
        runId: run.id,
        loopId: run.loopId,
        executionId: run.executionId,
        iteration: run.iteration ?? 0,
        prompt: resumeSessionId ? RESUME_LINE : run.promptSnapshot,
        config: run.executorConfig,
        cwd,
        ...(env ? { env } : {}),
        ...(resumeSessionId ? { resumeSessionId } : {}),
        ...(profile === 'review' ? { toolProfile: profile } : {}),
        ...(gateGuard ? { gateGuard } : {}), // no key with the gate off: such a run gets the input that it always got
      };
      for await (const ev of executor.execute(input, signal)) {
        if (signal.aborted) break; // already cancelled: the result is in the DB, drop the rest
        if (ev.type === 'session') {
          sessionId = ev.sessionId;
          await d.runs.setSession(run.id, ev.sessionId);
        } else if (ev.type === 'log') await this.#log(run, ev.level, ev.message, ev.data);
        else if (ev.type === 'usage_limit') {
          limit = ev; // the executor already wrote the `Error · ` line
          break; // `usage_limit` is the last event
        } else {
          const costUsd = ev.costUsd ?? run.costUsd; // a cost replaces the stored one, and a resumed run with no cost keeps it (decision 28)
          outcome =
            ev.outcome === 'succeeded'
              ? { status: 'succeeded', summary: ev.summary ?? null, costUsd, endResult: ev.end?.result ?? null, endPr: ev.end?.pr ?? null }
              : { status: 'failed', summary: ev.summary ?? null, error: ev.error ?? 'Unknown error', costUsd };
          if (ev.end?.result === 'RESOURCE_DOWN') resourceDown = ev.end.resource;
          break; // `result` is the last event
        }
      }
      if (!signal.aborted && !outcome && !limit) thrown = 'The executor ended without reporting a result';
    } catch (err) {
      if (!signal.aborted) thrown = err instanceof Error ? err.message : String(err);
    } finally {
      d.active.release(run.id);
    }
    if (signal.aborted) return;
    if (thrown !== null) {
      await this.#log(run, 'error', thrown);
      outcome = { status: 'failed', error: thrown, costUsd: run.costUsd };
    }
    if (limit) outcome = await this.#onLimit(run, limit, sessionId);
    if (resourceDown && run.trigger === 'probe') {
      const now = d.clock.now();
      await openHold(d, { resource: resourceDown, reason: `${resourceDown} is down`, until: null, openedByRunId: run.id, now });
    }
    if (outcome) await this.#finish(run, { ...outcome, finishedAt: d.clock.now() });
  }

  /**
   * Decision 43. A loop with no probe fails as it always did (epic decision 4). A probe run opens `plan-window` first, so no tick can see a held run with no
   * hold. With a session the run waits for the reset. `null` tells `#drive` that the run has no result to write yet, so it writes no `run.finished`.
   */
  async #onLimit(run: RunRecord, limit: UsageLimit, sessionId: string | null): Promise<DriveOutcome | null> {
    const d = this.#d;
    const failed: DriveOutcome = { status: 'failed', summary: null, error: limit.message, costUsd: limit.costUsd ?? run.costUsd };
    if (run.trigger !== 'probe') return failed;
    const now = d.clock.now();
    await openHold(d, { resource: RESERVED_RESOURCE, reason: limit.message, until: limit.resetsAt, openedByRunId: run.id, now });
    if (!sessionId) return { ...failed, endResult: USAGE_LIMIT_END };
    await d.runs.hold(run.id, limit.costUsd ?? null);
    d.events.publish({ type: 'loop.updated', at: now, loopId: run.loopId });
    return null;
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

  /** A resumed run has a later deadline than its start plus the limit, so the loop gives the limit. */
  async #timeoutSec(run: RunRecord): Promise<number> {
    if (run.resumeCount === 0) return timeoutSecOf(run);
    return (await this.#d.loops.findById(run.loopId))?.timeoutSec ?? timeoutSecOf(run);
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

/** Unlimited → no deadline: expireOverdue never picks this run (UC-24). */
function deadlineOf(loop: LoopRecord, now: Date): Date | null {
  return loop.timeoutSec === null ? null : new Date(now.getTime() + loop.timeoutSec * 1000);
}
