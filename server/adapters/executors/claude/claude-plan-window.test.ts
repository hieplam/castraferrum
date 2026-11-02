// ClaudePlanWindow (rule 6, evidence S4), with a fake `query`: no process opens.
import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { ClaudePlanWindow } from './claude-plan-window';

const T0 = new Date('2026-11-02T01:00:00.000Z');
const RESET = '2026-11-02T03:30:00.000Z';
const UNKNOWN = { utilization: null, resetsAt: null };

type Call = { options: Options; sent: SDKUserMessage[]; inputEnded: boolean; usageArgs: unknown };

/** Records each `query` and reads its input stream, as Claude Code reads stdin. `answer` gives the reply of the usage call. */
function fake(answer: () => unknown) {
  const calls: Call[] = [];
  const query = ({ prompt, options }: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => {
    const call: Call = { options, sent: [], inputEnded: false, usageArgs: undefined };
    calls.push(call);
    void (async () => {
      for await (const m of prompt) call.sent.push(m);
      call.inputEnded = true;
    })();
    return {
      usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: async (args: unknown) => {
        call.usageArgs = args;
        return answer();
      },
    };
  };
  return { calls, query };
}

function subject(query: unknown, timeoutMs?: number) {
  let now = T0.getTime();
  const clock = { now: () => new Date(now) };
  const window = new ClaudePlanWindow({ clock, query, env: () => ({ ANTHROPIC_API_KEY: 'key', KEPT: '1' }), ...(timeoutMs === undefined ? {} : { timeoutMs }) });
  return { window, advance: (ms: number) => (now += ms) };
}

const limits = (five: number, seven: number) => ({ rate_limits: { five_hour: { utilization: five, resets_at: RESET }, seven_day: { utilization: seven, resets_at: '2026-11-05T00:00:00.000Z' } } });

describe('ClaudePlanWindow', () => {
  it('the larger window counts, so a full week also refuses', async () => {
    expect((await subject(fake(() => limits(20, 91)).query).window.read()).utilization).toBe(91);
    expect((await subject(fake(() => limits(70, 30)).query).window.read()).utilization).toBe(70);
  });

  it('`resets_at` of the five-hour window is parsed to a date', async () => {
    expect((await subject(fake(() => limits(20, 91)).query).window.read()).resetsAt).toEqual(new Date(RESET));
  });

  it('`rate_limits` null, a missing `five_hour` or a bad date gives the unknown value', async () => {
    for (const answer of [{ rate_limits: null }, { rate_limits: {} }, { rate_limits: { five_hour: { utilization: 5, resets_at: 'soon' } } }, { rate_limits: { five_hour: { utilization: null, resets_at: RESET } } }]) {
      expect(await subject(fake(() => answer).query).window.read()).toEqual(UNKNOWN);
    }
  });

  it('a throw or a call that never answers gives the unknown value', async () => {
    const thrown = fake(() => {
      throw new Error('no login');
    });
    expect(await subject(thrown.query).window.read()).toEqual(UNKNOWN);
    const noCall = () => {
      throw new Error('no process');
    };
    expect(await subject(noCall).window.read()).toEqual(UNKNOWN);
    const hung = fake(() => new Promise(() => {}));
    expect(await subject(hung.query, 5).window.read()).toEqual(UNKNOWN);
    expect(hung.calls[0]?.options.abortController?.signal.aborted).toBe(true);
  });

  it('0 user messages are sent, with the options of rule 6', async () => {
    const f = fake(() => limits(1, 1));
    await subject(f.query).window.read();
    const [call] = f.calls;
    expect(call?.sent).toEqual([]);
    expect(call?.usageArgs).toEqual({ skipBehaviors: true });
    expect(call?.options).toMatchObject({ tools: [], persistSession: false, settingSources: [] });
    expect(call?.options.cwd).toMatch(/lc-plan-window$/);
    expect(call?.options.env).toEqual({ KEPT: '1' });
  });

  it('a second read in 60 s calls nothing, a read at 60 s calls again, and reads at one time share a call', async () => {
    const f = fake(() => limits(1, 1));
    const { window, advance } = subject(f.query);
    await Promise.all([window.read(), window.read()]);
    expect(f.calls).toHaveLength(1);
    advance(59_999);
    await window.read();
    expect(f.calls).toHaveLength(1);
    advance(1);
    await window.read();
    expect(f.calls).toHaveLength(2);
  });

  it('the stream is aborted after the answer', async () => {
    const f = fake(() => limits(1, 1));
    await subject(f.query).window.read();
    await new Promise<void>((r) => setImmediate(r));
    expect(f.calls[0]?.options.abortController?.signal.aborted).toBe(true);
    expect(f.calls[0]?.inputEnded).toBe(true);
  });
});
