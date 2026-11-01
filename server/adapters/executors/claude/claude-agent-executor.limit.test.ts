// The usage limit and the resume of ClaudeAgentExecutor (spec 2.5, decisions 25 to 28), with a fake `query`. No process opens, and no test waits on
// the wall clock: a stream ends on its own, or the test winds a fake `setTimeout`. A test that names something a run must NOT do holds a control:
// the same stream with a real trigger. So an executor with no handler fails every test here.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import { msg, scriptedQuery, type FakeCtx, type FakeQuery } from '../../../../tests/support/fake-claude-query';
import type { ExecutionEvent, ExecutionInput } from '../../../ports/executor';
import { ClaudeAgentExecutor, type ClaudeAgentExecutorOptions } from './claude-agent-executor';

type UsageLimit = Extract<ExecutionEvent, { type: 'usage_limit' }>;

const SECONDS = 1793527200; // a real `resetsAt` of evidence S1, 10 digits
const FALLBACK = "You've hit your usage limit";
const LIMIT_TEXT = "You've hit your limit · resets 3pm";
const WATCHDOG_MS = 2000; // reached only by a run that hangs, so only a failing test waits for it

const input = (over: Partial<ExecutionInput> = {}): ExecutionInput => ({
  runId: 'r',
  loopId: 'l',
  executionId: 'e',
  iteration: 3,
  prompt: 'Do the work',
  config: {},
  cwd: mkdtempSync(join(tmpdir(), 'lc-claude-limit-')),
  ...over,
});

const stream = (...messages: SDKMessage[]): FakeQuery =>
  scriptedQuery(
    async function* () {
      yield* messages;
    },
    { endsWithoutInput: true },
  );

async function events(q: FakeQuery, over: Partial<ClaudeAgentExecutorOptions> = {}, inp: ExecutionInput = input(), signal = new AbortController().signal): Promise<ExecutionEvent[]> {
  const out: ExecutionEvent[] = [];
  const run = (async () => {
    for await (const e of new ClaudeAgentExecutor({ query: q, ...over }).execute(inp, signal)) out.push(e);
  })();
  let timer: NodeJS.Timeout | undefined;
  const watchdog = new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error('the run hangs')), WATCHDOG_MS)));
  try {
    await Promise.race([run, watchdog]);
  } finally {
    clearTimeout(timer);
  }
  return out;
}

const logs = (list: ExecutionEvent[]) => list.filter((e) => e.type === 'log').map((e) => (e as { message: string }).message);
const limits = (list: ExecutionEvent[]) => list.filter((e): e is UsageLimit => e.type === 'usage_limit');

/** The run ended with exactly one `usage_limit`, as its last event, after exactly one error line. */
function theLimit(list: ExecutionEvent[]): UsageLimit {
  expect(list.at(-1)?.type).toBe('usage_limit');
  expect(limits(list)).toHaveLength(1);
  expect(list.filter((e) => e.type === 'result')).toHaveLength(0);
  const event = list.at(-1) as UsageLimit;
  expect(list.at(-2)).toEqual({ type: 'log', level: 'error', message: `Error · ${event.message}` });
  return event;
}

describe('ClaudeAgentExecutor: usage limit', () => {
  describe('each trigger alone', () => {
    it('a rejected rate_limit_event, with no other trigger', async () => {
      const list = await events(stream(msg.init('s-1'), msg.rateLimit('s-1', 'rejected', { resetsAt: SECONDS, rateLimitType: 'seven_day' })));
      expect(theLimit(list)).toEqual({ type: 'usage_limit', resetsAt: new Date(SECONDS * 1000), limitType: 'seven_day', message: FALLBACK });
    });

    it('an assistant error rate_limit, the only form that stored transcripts hold', async () => {
      const list = await events(stream(msg.init('s-1'), msg.assistant('s-1', 'working'), msg.limitError('s-1', LIMIT_TEXT)));
      expect(theLimit(list)).toEqual({ type: 'usage_limit', resetsAt: null, limitType: null, message: LIMIT_TEXT });
    });

    it('an error result with the text, in its errors', async () => {
      const list = await events(stream(msg.init('s-1'), msg.error('s-1', [LIMIT_TEXT], 0.25)));
      expect(theLimit(list)).toEqual({ type: 'usage_limit', resetsAt: null, limitType: null, message: LIMIT_TEXT, costUsd: 0.25 });
    });

    it('an is_error success with the text; the same text in a plain success or an assistant reply is no trigger', async () => {
      const list = await events(stream(msg.init('s-1'), msg.success('s-1', LIMIT_TEXT, 0.25, true)));
      expect(theLimit(list)).toEqual({ type: 'usage_limit', resetsAt: null, limitType: null, message: LIMIT_TEXT, costUsd: 0.25 });

      const plain = await events(stream(msg.init('s-2'), msg.assistant('s-2', LIMIT_TEXT), msg.success('s-2', LIMIT_TEXT, 0.25)));
      expect(limits(plain)).toEqual([]);
      expect(plain.at(-1)).toMatchObject({ type: 'result', outcome: 'succeeded' });
    });
  });

  describe('order of the triggers', () => {
    const merged = { type: 'usage_limit', resetsAt: new Date(SECONDS * 1000), limitType: 'five_hour', message: LIMIT_TEXT, costUsd: 0.25 };
    const rejected = msg.rateLimit('s-1', 'rejected', { resetsAt: SECONDS, rateLimitType: 'five_hour' });

    it('rate_limit_event, assistant error, result: one event with every value', async () => {
      const list = await events(stream(msg.init('s-1'), rejected, msg.limitError('s-1', 'first'), msg.error('s-1', [LIMIT_TEXT], 0.25)));
      expect(theLimit(list)).toEqual(merged);
    });

    it('assistant error, rate_limit_event, result: the same event', async () => {
      const list = await events(stream(msg.init('s-1'), msg.limitError('s-1', 'first'), rejected, msg.error('s-1', [LIMIT_TEXT], 0.25)));
      expect(theLimit(list)).toEqual(merged);
    });

    it('result first: the run ends there, and the executor reads no further message', async () => {
      const read: string[] = [];
      const q = scriptedQuery(async function* () {
        yield msg.init('s-1');
        yield msg.error('s-1', [LIMIT_TEXT], 0.25);
        read.push('after the result');
        yield rejected;
      });
      const list = await events(q);
      expect(theLimit(list)).toEqual({ type: 'usage_limit', resetsAt: null, limitType: null, message: LIMIT_TEXT, costUsd: 0.25 });
      expect(read).toEqual([]);
      expect(q.calls[0]!.options.abortController?.signal.aborted).toBe(true);
    });
  });

  describe('a status that allows the run', () => {
    const stops = async (status: 'allowed' | 'allowed_warning') => {
      const info = { resetsAt: SECONDS, rateLimitType: 'five_hour' };
      const list = await events(stream(msg.rateLimit('s-1', status, info), msg.init('s-1'), msg.assistant('s-1', 'working'), msg.rateLimit('s-1', status, info), msg.success('s-1', 'done', 0.1)));
      expect(limits(list)).toEqual([]);
      expect(list.at(-1)).toEqual({ type: 'result', outcome: 'succeeded', summary: 'done', costUsd: 0.1 });
      expect(logs(list)).toEqual(['Start round #3 · session s-1', 'End · Success · $0.10']);
      // Control: the same stream with `rejected` stops the run.
      const control = await events(stream(msg.init('s-1'), msg.rateLimit('s-1', 'rejected', info), msg.success('s-1', 'done', 0.1)));
      expect(theLimit(control).limitType).toBe('five_hour');
    };

    it('allowed never stops a run', () => stops('allowed'));

    it('allowed_warning never stops a run', () => stops('allowed_warning'));
  });

  describe('resetsAt', () => {
    const resetsAt = async (value: unknown) => {
      const info = value === undefined ? {} : { resetsAt: value };
      return theLimit(await events(stream(msg.init('s-1'), msg.rateLimit('s-1', 'rejected', info)))).resetsAt;
    };

    it('epoch seconds become a Date', async () => {
      expect(await resetsAt(SECONDS)).toEqual(new Date('2026-11-01T10:00:00.000Z'));
    });

    it('a missing or impossible value gives null', async () => {
      for (const value of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '1793527200', null]) expect(await resetsAt(value)).toBeNull();
    });

    it('13 digits (1e11 or more) give null, and the highest value below 1e11 is kept', async () => {
      expect(await resetsAt(SECONDS * 1000)).toBeNull();
      expect(await resetsAt(1e11)).toBeNull();
      expect(await resetsAt(1e11 - 1)).toEqual(new Date((1e11 - 1) * 1000));
    });
  });

  it('a rejected event before system/init: session comes first, from that event, exactly once', async () => {
    const list = await events(stream(msg.rateLimit('s-1', 'rejected', { resetsAt: SECONDS }), msg.init('s-1'), msg.limitError('s-1', LIMIT_TEXT)));
    expect(list[0]).toEqual({ type: 'session', sessionId: 's-1' });
    expect(list.filter((e) => e.type === 'session')).toHaveLength(1);
    expect(logs(list)).toEqual(['Start round #3 · session s-1', `Error · ${LIMIT_TEXT}`]);
    expect(theLimit(list)).toMatchObject({ message: LIMIT_TEXT, resetsAt: new Date(SECONDS * 1000) });
  });

  it('a hung stream: the default wait is 5000 ms from the first trigger, then the executor aborts the process', async () => {
    let reached!: () => void;
    const atHang = new Promise<void>((r) => (reached = r));
    const q = scriptedQuery(async function* () {
      yield msg.init('s-1');
      yield msg.limitError('s-1', LIMIT_TEXT);
      reached();
      await new Promise<void>(() => {}); // never ends, and it does not listen to the abort
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const out: ExecutionEvent[] = [];
      let ended = false;
      void (async () => {
        for await (const e of new ClaudeAgentExecutor({ query: q }).execute(input(), new AbortController().signal)) out.push(e);
        ended = true;
      })();
      await atHang;
      await vi.advanceTimersByTimeAsync(4999);
      expect(ended).toBe(false);
      expect(limits(out)).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(ended).toBe(true);
      expect(theLimit(out).message).toBe(LIMIT_TEXT);
      expect(q.calls[0]!.options.abortController?.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cost: a result that comes in the wait gives costUsd, also when it is a success, and the limit is applied over that result', async () => {
    const list = await events(stream(msg.init('s-1'), msg.limitError('s-1', LIMIT_TEXT), msg.success('s-1', 'done', 0.75)));
    expect(theLimit(list)).toEqual({ type: 'usage_limit', resetsAt: null, limitType: null, message: LIMIT_TEXT, costUsd: 0.75 });
  });

  it('cost: with no result in the wait the event keeps the cost of the last success, and with no result at all it has no cost', async () => {
    const q = scriptedQuery(
      async function* () {
        yield msg.init('s-1');
        yield msg.bgTasks('s-1', [{ id: 't1', description: 'tests' }]);
        yield msg.success('s-1', 'waiting', 0.5);
        yield msg.limitError('s-1', LIMIT_TEXT);
      },
      { endsWithoutInput: true },
    );
    expect(theLimit(await events(q)).costUsd).toBe(0.5);
    expect(theLimit(await events(stream(msg.init('s-2'), msg.limitError('s-2', LIMIT_TEXT)))).costUsd).toBeUndefined();
  });

  it('a subagent message with error rate_limit counts as a trigger', async () => {
    const list = await events(stream(msg.init('s-1'), msg.limitError('s-1', LIMIT_TEXT, 'tool-1')));
    expect(theLimit(list).message).toBe(LIMIT_TEXT);
  });

  it('cleanup turn: a limit is applied over the over-ceiling error', async () => {
    const script = async function* (ctx: FakeCtx) {
      yield msg.init('s-1');
      yield msg.bgTasks('s-1', [{ id: 't1', description: 'tests' }]);
      yield msg.success('s-1', 'waiting', 0.5);
      await ctx.sentMessage(2);
      yield msg.init('s-1');
      yield msg.limitError('s-1', LIMIT_TEXT);
      yield msg.error('s-1', [LIMIT_TEXT], 0.75);
    };
    const list = await events(scriptedQuery(script), { bgWaitCeilingMs: 1 });
    expect(theLimit(list).costUsd).toBe(0.75);
    expect(logs(list).join()).not.toContain('Waited more than');
  });

  it('cancel in the wait: the run ends at once with no event, and control: with no cancel the same stream gives usage_limit', async () => {
    let reached!: () => void;
    const atHang = new Promise<void>((r) => (reached = r));
    const hung = () =>
      scriptedQuery(async function* () {
        yield msg.init('s-1');
        yield msg.limitError('s-1', LIMIT_TEXT);
        reached();
        await new Promise<void>(() => {});
      });
    const ctrl = new AbortController();
    const running = events(hung(), { limitSettleMs: 60_000 }, input(), ctrl.signal);
    await atHang;
    ctrl.abort('cancelled');
    expect(limits(await running)).toEqual([]);

    expect(theLimit(await events(hung(), { limitSettleMs: 0 })).message).toBe(LIMIT_TEXT);
  });
});

describe('ClaudeAgentExecutor: resume', () => {
  // Decision: the plan lists "resume keeps the id" and "no resume on a new run" apart, but counts 21 tests. One test holds both.
  it('a resume keeps the session id, sends the prompt as the head message and logs Resume round; a new run has no option resume', async () => {
    const resumed = stream(msg.init('s-1'), msg.success('s-1', 'done', 0.1));
    const list = await events(resumed, {}, input({ resumeSessionId: 's-1' }));
    expect(resumed.calls[0]!.options.resume).toBe('s-1');
    expect(resumed.calls[0]!.sent[0]).toMatchObject({ message: { role: 'user', content: 'Do the work' } });
    expect(list[0]).toEqual({ type: 'session', sessionId: 's-1' });
    expect(logs(list)).toEqual(['Resume round #3 · session s-1', 'End · Success · $0.10']);

    const fresh = stream(msg.init('s-2'), msg.success('s-2', 'done', 0.1));
    expect(logs(await events(fresh))[0]).toBe('Start round #3 · session s-2');
    expect(fresh.calls[0]!.options).not.toHaveProperty('resume');
  });

  it('total_cost_usd of a session does not restart at 0, so the executor reports the last value and never adds (evidence S1: 0.0065729 stays)', async () => {
    const q = scriptedQuery(
      async function* () {
        yield msg.init('s-1');
        yield msg.bgTasks('s-1', [{ id: 't1', description: 'tests' }]);
        yield msg.success('s-1', 'waiting', 0.00061739);
        yield msg.bgTasks('s-1', []);
        yield msg.init('s-1');
        yield msg.success('s-1', 'done', 0.0065729);
      },
      { endsWithoutInput: true },
    );
    const list = await events(q, {}, input({ resumeSessionId: 's-1' }));
    expect(logs(list)[0]).toBe('Resume round #3 · session s-1');
    expect(list.at(-1)).toEqual({ type: 'result', outcome: 'succeeded', summary: 'done', costUsd: 0.0065729 });
  });
});
