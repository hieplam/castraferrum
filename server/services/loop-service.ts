import { DomainError, isDomainError } from '../../shared/domain/errors';
import { isValidTimeZone } from '../../shared/domain/schedule';
import type { Clock } from '../ports/clock';
import type { EventPublisher } from '../ports/events';
import type { ExecutionRecord } from '../ports/execution-repository';
import type { ExecutorDescriptor, ExecutorRegistry } from '../ports/executor';
import type { IdGenerator } from '../ports/ids';
import type { LoopFilter, LoopRecord } from '../ports/loop-repository';
import type { Page, PageRequest } from '../ports/page';
import type { Repositories } from '../ports/repositories';
import type { RepoRecord } from '../ports/repo-repository';
import type { RunRecord } from '../ports/run-repository';
import type {
  ExecutionDetail,
  ExecutionView,
  LoopDetail,
  LoopInput,
  LoopService,
  LoopView,
  OverviewView,
  RunService,
} from './contracts';
import { cleanLoopInput, nextRunAfter, startOfDay } from './loop-input';

export type LoopServiceDeps = Pick<Repositories, 'repos' | 'loops' | 'executions' | 'runs'> & {
  /** Only calls down into RunService (through the interface) — never the other way round. */
  runService: RunService;
  executors: ExecutorRegistry;
  clock: Clock;
  ids: IdGenerator;
  events: EventPublisher;
};

/** Latest run with a result: searched among this many newest runs (enough for phase 1 — a loop made only of skipped runs gives null). */
const LAST_RUN_WINDOW = 50;
const MAX_COPY_SUFFIX = 50;
const RETRIES = 3;
const DAY_MS = 86_400_000;

/** Loop use cases (UC-01, 03–06, 08–11). Start / Stop write state in the ExecutionRepository, then hand the run to RunService. */
export class DefaultLoopService implements LoopService {
  readonly #d: LoopServiceDeps;

  constructor(deps: LoopServiceDeps) {
    this.#d = deps;
  }

  async list(filter: LoopFilter): Promise<LoopView[]> {
    const now = this.#d.clock.now();
    const loops = await this.#d.loops.list(filter);
    const latest = await Promise.all(loops.map((l) => this.#latestExecution(l.id)));
    const stats = await this.#d.runs.statsByExecution(
      latest.flatMap((e) => (e ? [e.id] : [])),
      now,
    );
    return Promise.all(loops.map((l, i) => this.#view(l, latest[i] ?? null, stats)));
  }

  async get(id: string): Promise<LoopDetail> {
    const loop = await this.#load(id);
    const now = this.#d.clock.now();
    const all: ExecutionRecord[] = [];
    for (let cursor: string | null = null; ; ) {
      const page: Page<ExecutionRecord> = await this.#d.executions.listByLoop(id, { limit: 500, cursor });
      all.push(...page.items);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    let longest: LoopDetail['longestExecution'] = null;
    for (const e of all) {
      const elapsedMs = (e.endedAt ?? now).getTime() - e.startedAt.getTime();
      if (!longest || elapsedMs > longest.elapsedMs) longest = { executionId: e.id, seq: e.seq, elapsedMs };
    }
    const latest = all[0] ?? null;
    const stats = await this.#d.runs.statsByExecution(all.map((e) => e.id), now);
    let runCount = 0;
    for (const s of stats.values()) runCount += s.runs + s.skipped;
    return { ...(await this.#view(loop, latest, stats)), longestExecution: longest, runCount };
  }

  async create(input: LoopInput): Promise<LoopView> {
    const d = this.#d;
    const clean = cleanLoopInput(input, d.executors, await this.#repoExists(input.repoId));
    const now = d.clock.now();
    const loop = await d.loops.insert({ id: d.ids.newId(), ...clean, createdAt: now });
    d.events.publish({ type: 'loop.created', at: now, loopId: loop.id });
    return this.#view(loop, null, new Map());
  }

  async update(id: string, input: LoopInput, version: number): Promise<LoopView> {
    const d = this.#d;
    const before = await this.#load(id);
    const clean = cleanLoopInput(input, d.executors, await this.#repoExists(input.repoId));
    const now = d.clock.now();
    const updated = await d.loops.update(id, { ...clean, updatedAt: now }, version);
    // Changing the schedule while running → the next run is recomputed from now. A new prompt / executor applies from the next run on its own (snapshot).
    if (updated.status === 'active' && (updated.cron !== before.cron || updated.timezone !== before.timezone)) {
      await this.#reschedule(id, now);
    }
    d.events.publish({ type: 'loop.updated', at: now, loopId: id });
    return this.#viewOf(id);
  }

  async start(id: string): Promise<LoopView> {
    const d = this.#d;
    const loop = await this.#load(id);
    if (loop.archivedAt) throw new DomainError('LOOP_ARCHIVED', `Loop ${id} is archived — restore it before Start`);
    const now = d.clock.now();
    const res = await d.executions.open({
      id: d.ids.newId(),
      loopId: id,
      now,
      nextRunAt: nextRunAfter(loop.cron, loop.timezone, now), // next run = the first cron mark after Start
    });
    if (res.kind === 'already_active') throw new DomainError('LOOP_ALREADY_ACTIVE', `Loop ${id} is already running`);
    const execution = res.execution;
    d.events.publish({ type: 'execution.started', at: now, loopId: id, executionId: execution.id, seq: execution.seq });
    d.events.publish({ type: 'loop.updated', at: now, loopId: id });
    await d.runService.startFirst(id, execution.id); // UC-04: the first run starts immediately
    return this.#viewOf(id);
  }

  async stop(id: string): Promise<LoopView> {
    const d = this.#d;
    await this.#load(id);
    const now = d.clock.now();
    // Close the execution FIRST (loop → stopped, no more schedule), only then cancel the runs: a tick sneaking in between cannot open a new run.
    const closed = await d.executions.close(id, 'stopped', now);
    if (!closed) throw new DomainError('LOOP_NOT_ACTIVE', `Loop ${id} is not running`);
    for (const run of await d.runs.listActive(id)) await d.runService.cancel(run.id, 'cancelled'); // cancel every run
    d.events.publish({ type: 'execution.ended', at: now, loopId: id, executionId: closed.id, reason: 'stopped' });
    d.events.publish({ type: 'loop.updated', at: now, loopId: id });
    return this.#viewOf(id);
  }

  async duplicate(id: string): Promise<LoopView> {
    const d = this.#d;
    const src = await this.#load(id);
    const now = d.clock.now();
    for (let n = 1; n <= MAX_COPY_SUFFIX; n++) {
      const suffix = n === 1 ? ' (copy)' : ` (copy ${n})`;
      const name = [...src.name].slice(0, 80 - suffix.length).join('') + suffix;
      try {
        const copy = await d.loops.insert({
          id: d.ids.newId(),
          name,
          description: src.description,
          prompt: src.prompt,
          repoId: src.repoId,
          cron: src.cron,
          timezone: src.timezone,
          timeoutSec: src.timeoutSec,
          maxConcurrent: src.maxConcurrent,
          executorKind: src.executorKind,
          executorConfig: src.executorConfig,
          createdAt: now,
        });
        d.events.publish({ type: 'loop.created', at: now, loopId: copy.id });
        return this.#view(copy, null, new Map());
      } catch (err) {
        if (!isDomainError(err, 'LOOP_NAME_TAKEN')) throw err;
      }
    }
    throw new DomainError('LOOP_NAME_TAKEN', `Too many copies of "${src.name}" already exist`, { field: 'name' });
  }

  async archive(id: string): Promise<void> {
    const loop = await this.#load(id);
    if (loop.archivedAt) return;
    if (loop.status === 'active') throw new DomainError('LOOP_IS_ACTIVE', 'The loop is running — Stop it before archiving');
    await this.#setArchived(id, this.#d.clock.now());
  }

  async restore(id: string): Promise<LoopView> {
    const loop = await this.#load(id);
    if (loop.archivedAt) await this.#setArchived(id, null);
    return this.#viewOf(id);
  }

  async listExecutions(loopId: string, page: PageRequest): Promise<Page<ExecutionView>> {
    await this.#load(loopId);
    const res = await this.#d.executions.listByLoop(loopId, page);
    const stats = await this.#d.runs.statsByExecution(res.items.map((e) => e.id), this.#d.clock.now());
    return { items: res.items.map((e) => executionView(e, stats)), nextCursor: res.nextCursor };
  }

  async getExecution(executionId: string): Promise<ExecutionDetail> {
    const d = this.#d;
    const e = await d.executions.findById(executionId);
    if (!e) throw new DomainError('EXECUTION_NOT_FOUND', `No execution ${executionId}`);
    const [runs, stats] = await Promise.all([
      d.runs.listByExecution(executionId),
      d.runs.statsByExecution([executionId], d.clock.now()),
    ]);
    // UC-08: session ids in run order; a skipped run has no session.
    const sessionIds = runs.flatMap((r) => (r.sessionId ? [r.sessionId] : []));
    return { ...executionView(e, stats), runs, sessionIds };
  }

  async overview(timezone: string, repoId?: string): Promise<OverviewView> {
    if (!isValidTimeZone(timezone)) {
      const message = `Invalid time zone "${timezone}"`;
      throw new DomainError('VALIDATION_FAILED', message, { issues: [{ field: 'tz', code: 'invalid', message }] });
    }
    const now = this.#d.clock.now();
    const todayFrom = startOfDay(now, timezone);
    const [loops, runs] = await Promise.all([
      this.#d.loops.counts(repoId), // repoId only filters the per-tab loop counts (UC-25) — the overview numbers always cover the whole console
      this.#d.runs.countOverview(todayFrom, new Date(now.getTime() - DAY_MS)),
    ]);
    return {
      activeLoops: loops.active,
      runningRuns: runs.running,
      runsToday: runs.startedSince,
      errors24h: runs.failedSince,
      loops: { all: loops.active + loops.stopped, active: loops.active, stopped: loops.stopped, archived: loops.archived },
      timezone,
      todayFrom,
      now,
    };
  }

  executors(): ExecutorDescriptor[] {
    return this.#d.executors.list();
  }

  // ---------------------------------------------------------------- internals

  async #load(id: string): Promise<LoopRecord> {
    const loop = await this.#d.loops.findById(id);
    if (!loop) throw new DomainError('LOOP_NOT_FOUND', `No loop ${id}`);
    return loop;
  }

  async #repoExists(repoId: string | undefined): Promise<boolean> {
    const id = repoId?.trim();
    return !!id && (await this.#d.repos.findById(id)) !== null;
  }

  async #repo(id: string): Promise<RepoRecord> {
    const repo = await this.#d.repos.findById(id);
    if (!repo) throw new Error(`Loop points at repo ${id} which does not exist (the foreign key should prevent this)`);
    return repo;
  }

  async #latestExecution(loopId: string): Promise<ExecutionRecord | null> {
    return (await this.#d.executions.listByLoop(loopId, { limit: 1 })).items[0] ?? null;
  }

  async #viewOf(id: string): Promise<LoopView> {
    const loop = await this.#load(id);
    const latest = await this.#latestExecution(id);
    const stats = await this.#d.runs.statsByExecution(latest ? [latest.id] : [], this.#d.clock.now());
    return this.#view(loop, latest, stats);
  }

  async #view(loop: LoopRecord, latest: ExecutionRecord | null, stats: Map<string, ExecutionView['stats']>): Promise<LoopView> {
    const [repo, running, recent] = await Promise.all([
      this.#repo(loop.repoId),
      this.#d.runs.listActive(loop.id),
      latest ? this.#d.runs.listByLoop(loop.id, { limit: LAST_RUN_WINDOW }) : Promise.resolve({ items: [] as RunRecord[] }),
    ]);
    return {
      id: loop.id,
      name: loop.name,
      description: loop.description,
      prompt: loop.prompt,
      repo,
      cron: loop.cron,
      timezone: loop.timezone,
      timeoutSec: loop.timeoutSec,
      maxConcurrent: loop.maxConcurrent,
      executor: { kind: loop.executorKind, config: loop.executorConfig },
      status: loop.status,
      nextRunAt: loop.nextRunAt,
      version: loop.version,
      createdAt: loop.createdAt,
      updatedAt: loop.updatedAt,
      archivedAt: loop.archivedAt,
      iterations: loop.runCounter,
      executionCount: loop.executionCounter,
      currentExecution: latest ? executionView(latest, stats) : null,
      activeRun: running.at(-1) ?? null,
      activeRuns: [...running].reverse(),
      lastRun: recent.items.find((r) => r.status !== 'running' && r.status !== 'skipped') ?? null,
    };
  }

  /** Recompute the next run from `now` (compare-and-set; if a scheduler tick sneaks in, re-read and retry). */
  async #reschedule(id: string, now: Date): Promise<void> {
    for (let i = 0; i < RETRIES; i++) {
      const cur = await this.#load(id);
      if (cur.status !== 'active' || !cur.nextRunAt) return;
      if (await this.#d.loops.advanceNextRun(id, cur.nextRunAt, nextRunAfter(cur.cron, cur.timezone, now))) return;
    }
  }

  /** Archive / restore do not carry the form version: read the latest version, re-read on conflict. */
  async #setArchived(id: string, archivedAt: Date | null): Promise<void> {
    const d = this.#d;
    for (let i = 0; ; i++) {
      const cur = await this.#load(id);
      const now = d.clock.now();
      try {
        await d.loops.update(id, { archivedAt, updatedAt: now }, cur.version);
        d.events.publish({ type: 'loop.updated', at: now, loopId: id });
        return;
      } catch (err) {
        if (!isDomainError(err, 'VERSION_CONFLICT') || i >= RETRIES - 1) throw err;
      }
    }
  }
}

function executionView(e: ExecutionRecord, stats: Map<string, ExecutionView['stats']>): ExecutionView {
  return {
    id: e.id,
    loopId: e.loopId,
    seq: e.seq,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    endReason: e.endReason,
    stats: stats.get(e.id) ?? {
      runs: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      sessions: 0,
      elapsedMs: 0,
      avgDurationMs: null,
    },
  };
}
