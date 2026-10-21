// Test kit for the service tests: real services + memory/ repositories + OffsetClock + a real bus + a scripted executor.
// No HTTP, no real DB, independent of machine time: the clock stands still at T0 until the test advances it (`kit.clock.advance`).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { ClaudeAgentExecutor } from '../../server/adapters/executors/claude/claude-agent-executor';
import { NodeDirectoryProbe } from '../../server/adapters/fs/node-directory-probe';
import { InMemoryActiveRuns } from '../../server/adapters/active-runs/in-memory-active-runs';
import { OffsetClock } from '../../server/adapters/clock/offset-clock';
import { InProcessEventBus } from '../../server/adapters/events/in-process-event-bus';
import { MockExecutor } from '../../server/adapters/executors/mock/mock-executor';
import { StaticExecutorRegistry } from '../../server/adapters/executors/static-executor-registry';
import { RandomIdGenerator } from '../../server/adapters/ids/random-id-generator';
import { createMemoryRepositories } from '../../server/adapters/memory';
import type { MemoryDb } from '../../server/adapters/memory/memory-db';
import type { EventPublisher } from '../../server/ports/events';
import type { ExecutionEvent, ExecutionInput, ExecutorDescriptor, LoopExecutor } from '../../server/ports/executor';
import type { DomainEvent, LoopInput } from '../../server/services/contracts';
import { DefaultLiveService } from '../../server/services/live-service';
import { DefaultLoopService } from '../../server/services/loop-service';
import { DefaultRecoveryService } from '../../server/services/recovery-service';
import { DefaultRepoService } from '../../server/services/repo-service';
import { DefaultRunService } from '../../server/services/run-service';
import { DefaultSchedulingService } from '../../server/services/scheduling-service';
import { fakeQuery } from './fake-claude-query';

/** 08:00 Vietnam time. The default schedule `*\/5 * * * *` -> the next run is 08:05 (01:05Z). */
export const T0 = new Date('2026-10-18T01:00:00.000Z');
export const MIN = 60_000;

// ---------------------------------------------------------------- scripted executor

type QueueItem = ExecutionEvent | { type: 'throw'; error: Error } | { type: 'end' };

/** One run of the ScriptedExecutor: the test decides every event. */
export class ScriptedRun {
  readonly input: ExecutionInput;
  readonly signal: AbortSignal;
  readonly #queue: QueueItem[] = [];
  #wake: (() => void) | null = null;
  /** Out of the loop (finished / cancelled / threw). */
  ended = false;

  readonly ignoreSignal: boolean;

  constructor(input: ExecutionInput, signal: AbortSignal, ignoreSignal: boolean) {
    this.input = input;
    this.ignoreSignal = ignoreSignal;
    this.signal = signal;
    if (!ignoreSignal) signal.addEventListener('abort', () => this.#poke(), { once: true });
  }

  log(message: string, level: 'info' | 'warn' | 'error' = 'info'): this {
    return this.#push({ type: 'log', level, message });
  }
  session(sessionId: string): this {
    return this.#push({ type: 'session', sessionId });
  }
  succeed(summary = 'xong'): this {
    return this.#push({ type: 'result', outcome: 'succeeded', summary });
  }
  fail(error = 'broken'): this {
    return this.#push({ type: 'result', outcome: 'failed', error });
  }
  throw(message = 'boom'): this {
    return this.#push({ type: 'throw', error: new Error(message) });
  }
  /** End the iterable without reporting a result (a badly written executor). */
  end(): this {
    return this.#push({ type: 'end' });
  }

  #push(item: QueueItem): this {
    this.#queue.push(item);
    this.#poke();
    return this;
  }
  #poke(): void {
    const w = this.#wake;
    this.#wake = null;
    w?.();
  }

  async *iterate(autoSession: string | null): AsyncGenerator<ExecutionEvent> {
    try {
      if (autoSession) yield { type: 'session', sessionId: autoSession };
      for (;;) {
        if (this.signal.aborted && !this.ignoreSignal) return;
        const item = this.#queue.shift();
        if (!item) {
          await new Promise<void>((r) => (this.#wake = r));
          continue;
        }
        if (item.type === 'throw') throw item.error;
        if (item.type === 'end') return;
        yield item;
        if (item.type === 'result') return;
      }
    } finally {
      this.ended = true;
    }
  }
}

export class ScriptedExecutor implements LoopExecutor {
  readonly kind = 'scripted';
  readonly calls: ScriptedRun[] = [];
  /** Emit `session` by itself right at the start (id `scripted-<n>`). */
  autoSession = true;
  /** Simulate an executor that ignores the cancel signal. */
  ignoreSignal = false;

  describe(): ExecutorDescriptor {
    return { kind: this.kind, label: 'Scripted (test)', configSchema: z.object({}).loose(), cancelWithinMs: 1000 };
  }

  execute(input: ExecutionInput, signal: AbortSignal): AsyncIterable<ExecutionEvent> {
    const run = new ScriptedRun(input, signal, this.ignoreSignal);
    this.calls.push(run);
    return run.iterate(this.autoSession ? `scripted-${this.calls.length}` : null);
  }

  /** The n-th run (counting from 1) the executor received. */
  call(n: number): ScriptedRun {
    const run = this.calls[n - 1];
    if (!run) throw new Error(`the executor has received only ${this.calls.length} runs, there is no run #${n}`);
    return run;
  }
}

// ---------------------------------------------------------------- kit

/** Let background promises / `for await` loops run everything that is ready (no real IO, so a few turns are enough). */
export async function flush(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise<void>((r) => setImmediate(r));
}

/**
 * Wait until `cond()` is true (each attempt lets the background run one turn); past 500 turns **and** past 5 seconds -> a clear error, no hang.
 * Time cap because some steps touch real IO (the repo folder, UC-23): on a busy machine the 500 turns run out before the IO finishes.
 */
export async function until(cond: () => boolean | Promise<boolean>, what = 'condition'): Promise<void> {
  const deadline = performance.now() + 5_000;
  for (let i = 0; i < 500 || performance.now() < deadline; i++) {
    if (await cond()) return;
    await new Promise<void>((r) => setImmediate(r));
  }
  throw new Error(`waited forever for: ${what}`);
}

export type Kit = ReturnType<typeof makeKit>;

export function makeKit(opts: { db?: MemoryDb; clock?: OffsetClock; mock?: MockExecutor } = {}) {
  const repos = createMemoryRepositories(opts.db);
  const clock = opts.clock ?? new OffsetClock(() => T0.getTime());
  const bus = new InProcessEventBus();
  const events: DomainEvent[] = [];
  const publisher: EventPublisher = {
    publish(e) {
      events.push(e);
      bus.publish(e);
    },
  };
  const scripted = new ScriptedExecutor();
  const mock = opts.mock ?? new MockExecutor({ random: () => 0.99 });
  // Claude with a fake `query` (no process opened): enough to see the service pass `cwd` and the "Repo does not exist" branch (UC-23).
  const claudeQuery = fakeQuery();
  const claude = new ClaudeAgentExecutor({ query: claudeQuery });
  const executors = new StaticExecutorRegistry([mock, scripted, claude]);
  const active = new InMemoryActiveRuns();
  const ids = new RandomIdGenerator();
  const runService = new DefaultRunService({ ...repos, executors, active, clock, ids, events: publisher });
  const loopService = new DefaultLoopService({ ...repos, runService, executors, clock, ids, events: publisher });
  const scheduling = new DefaultSchedulingService({ loops: repos.loops, heartbeat: repos.heartbeat, runService, clock });
  const recovery = new DefaultRecoveryService({ ...repos, clock });
  const live = new DefaultLiveService({ runs: repos.runs, logs: repos.logs, source: bus });
  const repoService = new DefaultRepoService({ repos: repos.repos, directories: new NodeDirectoryProbe(), clock, ids });

  /** A real temp folder as the repo (written straight into the repos "table" - synchronous, not through the service). */
  const addRepo = (name?: string) => {
    const path = mkdtempSync(join(tmpdir(), 'lc-svc-repo-'));
    const repo = { id: ids.newId(), name: name ?? basename(path), path, createdAt: T0 };
    repos.db.insertRepo(repo);
    return repo;
  };
  /** The default repo of `input()` - a kit rebuilt on the same `db` (simulating a restart) reuses the existing repo. */
  const repo = [...repos.db.repos.values()].find((r) => r.name === 'default repo') ?? addRepo('default repo');

  let n = 0;
  /** A valid LoopInput, default scripted executor + a schedule every 5 minutes + a 1 800 second timeout (like phase 1). */
  const input = (over: Partial<LoopInput> = {}): LoopInput => ({
    name: `loop ${++n}`,
    prompt: 'Do the work',
    repoId: repo.id,
    cron: '*/5 * * * *',
    timeoutSec: 1800,
    executor: { kind: 'scripted' },
    ...over,
  });

  return {
    repos,
    db: repos.db,
    clock,
    bus,
    events,
    scripted,
    mock,
    active,
    runService,
    loopService,
    scheduling,
    recovery,
    live,
    repoService,
    repo,
    addRepo,
    claudeQuery,
    input,
    /** Events emitted, filtered by type. */
    eventsOf<T extends DomainEvent['type']>(type: T): Extract<DomainEvent, { type: T }>[] {
      return events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);
    },
    /** Runs `running` in the "DB" (every loop). */
    runningCount(): number {
      return [...repos.db.runs.values()].filter((r) => r.status === 'running').length;
    },
    /** Advance the clock to the exact boundary then run one schedule tick. */
    async tickAt(at: Date) {
      clock.set(at);
      const report = await scheduling.tick();
      await flush();
      return report;
    },
  };
}
