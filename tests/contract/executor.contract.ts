// Executor contract (ARCHITECTURE.md, Interface section: executor contract). ONE suite for every LoopExecutor implementation:
// phase 1 runs on Mock (executor-mock.test.ts), phase 2 reruns this same suite for the Claude Agent SDK (executor-claude.test.ts,
// with a fake `query`, and real Claude when LC_REAL_CLAUDE=1). If
// an executor swap still passes this suite, RunService does not break. Add new cases HERE.
// Measured in real time (no fake timers): the phase 2 executor calls the real network, this suite must work for it.
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { ExecutionEvent, ExecutionInput, LoopExecutor } from '../../server/ports/executor';

export type ExecutorSample = { prompt: string; config: unknown };

export type ExecutorContractEnv = {
  make(): LoopExecutor;
  /** Executor for the `failing` case when the failure does not come from configuration (real Claude: broken login). Defaults to `make()`. */
  makeFailing?(): LoopExecutor;
  /**
   * Extra executor-specific checks after a successful turn (e.g. real Claude: the file the agent created sits in `input.cwd`, a
   * session file exists, `costUsd > 0`). Same case name for every executor - the extra checks only tighten, they do not replace the shared part.
   */
  checkSucceeded?(input: ExecutionInput, events: ExecutionEvent[]): void | Promise<void>;
  /** A turn that ends successfully within `runWithinMs`. */
  succeeding: ExecutorSample;
  /** A turn that ends in failure (result failed or a thrown error) within `runWithinMs`. */
  failing: ExecutorSample;
  /** A turn that runs far longer than `cancelWithinMs` - used to measure cancellation. */
  long: ExecutorSample;
  /** Configuration invalid per `configSchema`. */
  invalidConfig: unknown;
  runWithinMs: number;
};

const input = (s: ExecutorSample | { prompt: string; config: unknown }): ExecutionInput => ({
  runId: randomUUID(),
  loopId: randomUUID(),
  executionId: randomUUID(),
  iteration: 1,
  prompt: s.prompt,
  config: s.config,
  // Each turn gets a real temp directory as its repo (Mock ignores it, Claude runs the session in it).
  cwd: mkdtempSync(join(tmpdir(), 'lc-exec-contract-')),
});

type Outcome = { events: ExecutionEvent[]; error: unknown; ended: boolean; elapsedMs: number };

/** Iterate the whole iterable, at most `withinMs` (past the deadline -> ended = false, no further waiting). */
async function collect(iter: AsyncIterator<ExecutionEvent>, withinMs: number, seed: ExecutionEvent[] = []): Promise<Outcome> {
  const events = [...seed];
  const t0 = performance.now();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((r) => (timer = setTimeout(() => r('timeout'), withinMs)));
  try {
    for (;;) {
      const r = await Promise.race([iter.next(), timeout]);
      if (r === 'timeout') return { events, error: null, ended: false, elapsedMs: performance.now() - t0 };
      if (r.done) return { events, error: null, ended: true, elapsedMs: performance.now() - t0 };
      events.push(r.value);
    }
  } catch (error) {
    return { events, error, ended: true, elapsedMs: performance.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/** session exactly once and first; logs well-formed; at most one result and it is the last event. */
function expectProtocol(events: ExecutionEvent[]): void {
  expect(events[0]?.type, 'the first event must be session').toBe('session');
  expect(events.filter((e) => e.type === 'session'), 'exactly one session').toHaveLength(1);
  const first = events[0] as Extract<ExecutionEvent, { type: 'session' }>;
  expect(typeof first.sessionId === 'string' && first.sessionId.length > 0, 'sessionId is not empty').toBe(true);
  for (const e of events) {
    if (e.type === 'log') {
      expect(['info', 'warn', 'error']).toContain(e.level);
      expect(typeof e.message).toBe('string');
    }
  }
  const results = events.filter((e) => e.type === 'result');
  expect(results.length, 'at most one result').toBeLessThanOrEqual(1);
  if (results.length === 1) expect(events.at(-1)?.type, 'result is the last event').toBe('result');
}

/** Only an executor with a way to force a limit runs these cases: no agent can force a limit on real Claude (spec, goal table). */
export function executorContract(env: () => ExecutorContractEnv, limit?: { usageLimit: ExecutorSample }): void {
  if (limit) {
    const reachLimit = (x: LoopExecutor, over: Partial<ExecutionInput> = {}) =>
      collect(x.execute({ ...input(limit.usageLimit), ...over }, new AbortController().signal)[Symbol.asyncIterator](), env().runWithinMs);

    it('usage_limit: the final event of the run, with session first, no result, and a message', async () => {
      const out = await reachLimit(env().make());
      expect(out.ended).toBe(true);
      expect(out.error).toBeNull();
      expectProtocol(out.events);
      expect(out.events.filter((ev) => ev.type === 'result')).toEqual([]);
      const last = out.events.at(-1) as Extract<ExecutionEvent, { type: 'usage_limit' }>;
      expect(last.type).toBe('usage_limit');
      expect(last.message.length).toBeGreaterThan(0);
    });

    it('usage_limit: a resume of that session keeps the same session id', async () => {
      const x = env().make();
      const first = await reachLimit(x);
      const sessionId = (first.events[0] as Extract<ExecutionEvent, { type: 'session' }>).sessionId;
      const resumed = await reachLimit(x, { resumeSessionId: sessionId });
      expectProtocol(resumed.events);
      expect(resumed.events[0]).toEqual({ type: 'session', sessionId });
    });
  }

  it('describe(): kind matches the executor, has a label, schema accepts the sample config and rejects the invalid one, declares the cancel deadline', () => {
    const e = env();
    const x = e.make();
    const d = x.describe();
    expect(d.kind).toBe(x.kind);
    expect(d.label.length).toBeGreaterThan(0);
    expect(d.cancelWithinMs).toBeGreaterThan(0);
    for (const s of [e.succeeding, e.failing, e.long]) expect(d.configSchema.safeParse(s.config).success).toBe(true);
    expect(d.configSchema.safeParse(e.invalidConfig).success).toBe(false);
  });

  it('successful turn: session first (exactly one), 0..n logs, exactly one succeeded result at the end', async () => {
    const e = env();
    const inp = input(e.succeeding);
    const out = await collect(e.make().execute(inp, new AbortController().signal)[Symbol.asyncIterator](), e.runWithinMs);
    expect(out.ended, `ends within ${e.runWithinMs} ms`).toBe(true);
    expect(out.error).toBeNull();
    expectProtocol(out.events);
    expect(out.events.at(-1)).toMatchObject({ type: 'result', outcome: 'succeeded' });
    await e.checkSucceeded?.(inp, out.events);
  });

  it('failed turn: session first, then a failed result with an error - or a thrown error', async () => {
    const e = env();
    const x = e.makeFailing?.() ?? e.make();
    const out = await collect(x.execute(input(e.failing), new AbortController().signal)[Symbol.asyncIterator](), e.runWithinMs);
    expect(out.ended, `ends within ${e.runWithinMs} ms`).toBe(true);
    expectProtocol(out.events);
    if (out.error === null) {
      const last = out.events.at(-1);
      expect(last).toMatchObject({ type: 'result', outcome: 'failed' });
      expect((last as { error?: string }).error?.length).toBeGreaterThan(0);
    }
  });

  it('each turn has its own session id', async () => {
    const e = env();
    const x = e.make();
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const ctrl = new AbortController();
      const first = await x.execute(input(e.long), ctrl.signal)[Symbol.asyncIterator]().next();
      ctrl.abort('cancelled');
      expect(first.value).toMatchObject({ type: 'session' });
      ids.push((first.value as { sessionId: string }).sessionId);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('stops within cancelWithinMs after cancel: the iterable ends, no result emitted after the cancel (session was already there)', async () => {
    const e = env();
    const x = e.make();
    const limit = x.describe().cancelWithinMs;
    const ctrl = new AbortController();
    const iter = x.execute(input(e.long), ctrl.signal)[Symbol.asyncIterator]();
    const head: ExecutionEvent[] = [];
    // wait until the turn is really running (session + at least one more event) before cancelling
    for (let i = 0; i < 2; i++) {
      const r = await iter.next();
      if (r.done) break;
      head.push(r.value);
    }
    expect(head[0]).toMatchObject({ type: 'session' });
    ctrl.abort('cancelled');
    const out = await collect(iter, limit + 200, head);
    expect(out.ended, `ends after cancel (limit ${limit} ms)`).toBe(true);
    expect(out.elapsedMs).toBeLessThanOrEqual(limit);
    expect(out.events.slice(head.length).some((ev) => ev.type === 'result'), 'no result after cancel').toBe(false);
  });

  it('signal aborted before start -> ends within cancelWithinMs, no result', async () => {
    const e = env();
    const x = e.make();
    const ctrl = new AbortController();
    ctrl.abort('cancelled');
    const out = await collect(x.execute(input(e.long), ctrl.signal)[Symbol.asyncIterator](), x.describe().cancelWithinMs + 200);
    expect(out.ended).toBe(true);
    expect(out.elapsedMs).toBeLessThanOrEqual(x.describe().cancelWithinMs);
    expect(out.events.some((ev) => ev.type === 'result')).toBe(false);
  });

  it('does not throw synchronously: an invalid config only fails during iteration (thrown error or failed result)', async () => {
    const e = env();
    const x = e.make();
    let iterable: AsyncIterable<ExecutionEvent> | undefined;
    expect(() => {
      iterable = x.execute(input({ prompt: e.succeeding.prompt, config: e.invalidConfig }), new AbortController().signal);
    }).not.toThrow();
    const out = await collect(iterable![Symbol.asyncIterator](), e.runWithinMs);
    expect(out.ended).toBe(true);
    expect(out.error !== null || out.events.at(-1)?.type === 'result').toBe(true);
    if (out.error === null) expect(out.events.at(-1)).toMatchObject({ outcome: 'failed' });
  });
}
