// Mock's own behaviour (SPEC § Model - Mock Executor), under fake timers: no waiting for real seconds.
// The shared contract part (every executor) lives in tests/contract/executor.contract.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionEvent, ExecutionInput } from '../../../ports/executor';
import { excerpt, MockExecutor, mockConfigSchema } from './mock-executor';

const input = (config: unknown, prompt = 'Do the work'): ExecutionInput => ({
  runId: 'r',
  loopId: 'l',
  executionId: 'e',
  iteration: 7,
  cwd: '/not-used', // Mock ignores cwd
  prompt,
  config,
});

/** Runs the iterable to the end under fake timers, recording the ms mark of each event. */
async function drive(it: AsyncIterable<ExecutionEvent>, stepMs = 1000) {
  const out: [number, ExecutionEvent][] = [];
  const t0 = Date.now();
  const iter = it[Symbol.asyncIterator]();
  for (;;) {
    let res: IteratorResult<ExecutionEvent> | undefined;
    const p = iter.next().then((r) => (res = r));
    await vi.advanceTimersByTimeAsync(0);
    for (let guard = 0; res === undefined; guard++) {
      if (guard > 10_000) throw new Error('the executor emits no more events');
      await vi.advanceTimersByTimeAsync(stepMs);
    }
    await p;
    if (res.done) return out;
    out.push([Date.now() - t0, res.value]);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-18T01:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('MockExecutor', () => {
  it('session mock-<uuid> → Start round #N — prompt: «…» → working… (k/N) every second → Done (simulated) → succeeded', async () => {
    const m = new MockExecutor({ random: () => 0.99, newSessionId: () => 'mock-1' });
    const events = await drive(m.execute(input({ durationSec: 3 }), new AbortController().signal));
    expect(events).toEqual([
      [0, { type: 'session', sessionId: 'mock-1' }],
      [0, { type: 'log', level: 'info', message: 'Start round #7 — prompt: «Do the work»' }],
      [1000, { type: 'log', level: 'info', message: 'working… (1/3)' }],
      [2000, { type: 'log', level: 'info', message: 'working… (2/3)' }],
      [3000, { type: 'log', level: 'info', message: 'working… (3/3)' }],
      [3000, { type: 'log', level: 'info', message: 'Done (simulated)' }],
      [3000, { type: 'result', outcome: 'succeeded', summary: 'Done (simulated)' }],
    ]);
  });

  it('default session id has the form mock-<uuid>, one id per turn', async () => {
    const m = new MockExecutor();
    const first = async () => (await m.execute(input({ durationSec: 1 }), new AbortController().signal)[Symbol.asyncIterator]().next()).value;
    const [a, b] = [await first(), await first()];
    expect(a).toMatchObject({ type: 'session', sessionId: expect.stringMatching(/^mock-[0-9a-f-]{36}$/) });
    expect(a).not.toEqual(b);
  });

  it('failRate: random × 100 < failRate → stops at second 1 + ⌊random × N⌋ with Simulated error → failed', async () => {
    const seq = [0.1, 0.6]; // 10 < 50 → fail; second 1 + ⌊0.6 × 5⌋ = 4
    const m = new MockExecutor({ random: () => seq.shift()! });
    const events = await drive(m.execute(input({ durationSec: 5, failRate: 50 }), new AbortController().signal));
    expect(events.slice(2).map(([t, e]) => [t, e.type === 'log' ? e.message : e.type === 'result' ? e.outcome : e.type])).toEqual([
      [1000, 'working… (1/5)'],
      [2000, 'working… (2/5)'],
      [3000, 'working… (3/5)'],
      [4000, 'Simulated error'],
      [4000, 'failed'],
    ]);
    expect(events.at(-1)?.[1]).toEqual({ type: 'result', outcome: 'failed', error: 'Simulated error' });
  });

  it('failRate 0 never fails, 100 always fails', async () => {
    const ok = await drive(new MockExecutor({ random: () => 0 }).execute(input({ durationSec: 1, failRate: 0 }), new AbortController().signal));
    expect(ok.at(-1)?.[1]).toMatchObject({ outcome: 'succeeded' });
    const bad = await drive(new MockExecutor({ random: () => 0.999 }).execute(input({ durationSec: 1, failRate: 100 }), new AbortController().signal));
    expect(bad.at(-1)?.[1]).toMatchObject({ outcome: 'failed' });
  });

  it('aborting the signal mid-second → ends at once (does not wait out the second), emits no result', async () => {
    const m = new MockExecutor();
    const ctrl = new AbortController();
    const iter = m.execute(input({ durationSec: 600 }), ctrl.signal)[Symbol.asyncIterator]();
    await iter.next(); // session
    await iter.next(); // Start…
    const pending = iter.next();
    await vi.advanceTimersByTimeAsync(300);
    ctrl.abort('cancelled');
    await vi.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toEqual({ value: undefined, done: true });
    expect(vi.getTimerCount()).toBe(0); // leaves no timer behind
  });

  it('bad config → error during iteration, not thrown synchronously; missing config → defaults of 10 seconds, 0 %', async () => {
    const m = new MockExecutor();
    const it = m.execute(input({ durationSec: 0 }), new AbortController().signal);
    await expect(it[Symbol.asyncIterator]().next()).rejects.toThrow();
    expect(mockConfigSchema.parse({})).toEqual({ durationSec: 10, failRate: 0 });
    expect(m.describe()).toMatchObject({ kind: 'mock', cancelWithinMs: 1000 });
  });

  it('prompt is shortened to the first 80 characters on one line, with … appended', () => {
    expect(excerpt('  line 1\n  line 2 ')).toBe('line 1 line 2');
    expect(excerpt('😀'.repeat(80))).toBe('😀'.repeat(80));
    expect(excerpt('😀'.repeat(81))).toBe(`${'😀'.repeat(80)}…`);
  });
});
