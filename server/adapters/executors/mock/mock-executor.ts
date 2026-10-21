import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ExecutionEvent, ExecutionInput, ExecutorDescriptor, LoopExecutor } from '../../../ports/executor';

// Phase 1 simulated executor (SPEC § Model — Mock Executor): reports a fake session id, prints `Start round #N — prompt: «…»`,
// one `working… (k/N)` line per second, then `Done (simulated)`; with probability failRate it stops midway with `Simulated error`.
// It goes through the exact LoopExecutor interface that the Claude Agent SDK executor (phase 2) will use.

export const mockConfigSchema = z.object({
  durationSec: z.number().int().min(1).max(600).default(10),
  failRate: z.number().min(0).max(100).default(0),
});
export type MockConfig = z.infer<typeof mockConfigSchema>;

/** Waits `ms`, returning early as soon as `signal` aborts (does not throw). */
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export const abortableSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });

export type MockExecutorOptions = {
  /** Random number [0, 1) - decides whether the turn fails and at which second. */
  random?: () => number;
  sleep?: Sleep;
  /** Length of one Mock "second" (ms). Only tests change it, to run fast; the real value = 1,000. */
  tickMs?: number;
  newSessionId?: () => string;
};

const PROMPT_EXCERPT = 80;

export class MockExecutor implements LoopExecutor {
  readonly kind = 'mock';
  readonly #random: () => number;
  readonly #sleep: Sleep;
  readonly #tickMs: number;
  readonly #newSessionId: () => string;

  constructor(opts: MockExecutorOptions = {}) {
    this.#random = opts.random ?? Math.random;
    this.#sleep = opts.sleep ?? abortableSleep;
    this.#tickMs = opts.tickMs ?? 1000;
    this.#newSessionId = opts.newSessionId ?? (() => `mock-${randomUUID()}`);
  }

  describe(): ExecutorDescriptor {
    return { kind: this.kind, label: 'Mock (simulated)', configSchema: mockConfigSchema, cancelWithinMs: 1000 };
  }

  execute(input: ExecutionInput, signal: AbortSignal): AsyncIterable<ExecutionEvent> {
    // Do not throw synchronously: every error (including a bad config) surfaces during iteration.
    return this.#run(input, signal);
  }

  async *#run(input: ExecutionInput, signal: AbortSignal): AsyncGenerator<ExecutionEvent> {
    const cfg = mockConfigSchema.parse(input.config ?? {});
    yield { type: 'session', sessionId: this.#newSessionId() };
    if (signal.aborted) return;
    yield { type: 'log', level: 'info', message: `Start round #${input.iteration} — prompt: «${excerpt(input.prompt)}»` };
    // Fail at second failAt (1…durationSec) with failRate % probability.
    const failAt = this.#random() * 100 < cfg.failRate ? 1 + Math.floor(this.#random() * cfg.durationSec) : null;
    for (let k = 1; k <= cfg.durationSec; k++) {
      await this.#sleep(this.#tickMs, signal);
      if (signal.aborted) return;
      if (k === failAt) {
        yield { type: 'log', level: 'error', message: 'Simulated error' };
        yield { type: 'result', outcome: 'failed', error: 'Simulated error' };
        return;
      }
      yield { type: 'log', level: 'info', message: `working… (${k}/${cfg.durationSec})` };
    }
    yield { type: 'log', level: 'info', message: 'Done (simulated)' };
    yield { type: 'result', outcome: 'succeeded', summary: 'Done (simulated)' };
  }
}

/** First 80 characters of the prompt on one line, with `…` appended when cut. */
export function excerpt(prompt: string): string {
  const flat = prompt.replace(/\s+/g, ' ').trim();
  const chars = [...flat];
  return chars.length > PROMPT_EXCERPT ? `${chars.slice(0, PROMPT_EXCERPT).join('')}…` : flat;
}
