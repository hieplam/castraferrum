// Test mode only opens REAL Claude in a `lc-real-claude-*` directory: the test data are Claude loops (the real console only
// has the Claude executor left) - their schedule ticks must not open real Claude Code, with permissions bypassed, in a sample repo.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';
import { ClaudeAgentExecutor, type QueryFn } from './claude-agent-executor';
import { FAKE_CLAUDE_DIR_PREFIX, REAL_CLAUDE_DIR_PREFIX, soakSecondsOf, testModeQuery } from './test-mode-query';

function recordingQuery(): QueryFn & { calls: Options[] } {
  const calls: Options[] = [];
  const fn = ((params: { prompt: string; options: Options }) => {
    calls.push(params.options);
    return (async function* () {
      yield { type: 'system', subtype: 'init', session_id: 's-1' } as unknown as SDKMessage;
      yield { type: 'result', subtype: 'success', is_error: false, result: 'done', total_cost_usd: 0.01, session_id: 's-1' } as unknown as SDKMessage;
    })();
  }) as unknown as QueryFn & { calls: Options[] };
  fn.calls = calls;
  return fn;
}

async function all<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

const input = (cwd: string) => ({ loopId: 'l', runId: 'r', executionId: 'e', iteration: 1, prompt: 'p', config: { model: 'haiku', effort: 'low' }, cwd });

describe('testModeQuery (test mode)', () => {
  it('a lc-real-claude-* directory → calls the real query; both Windows and POSIX paths', async () => {
    const real = recordingQuery();
    const q = testModeQuery(real);
    for (const cwd of [`C:\\Users\\alice\\AppData\\Local\\Temp\\${REAL_CLAUDE_DIR_PREFIX}AbC`, `/tmp/${REAL_CLAUDE_DIR_PREFIX}xyz/`]) {
      expect(await all(q({ prompt: 'p', options: { cwd } }))).toHaveLength(2);
    }
    expect(real.calls).toHaveLength(2);
  });

  it('any other directory (e.g. the real Atlas repo) → does not call the real query, the turn fails immediately', async () => {
    const real = recordingQuery();
    const dir = mkdtempSync(join(tmpdir(), 'lc24-not-real-claude-')); // the directory really exists: the "repo does not exist" check passes
    const events = await all(new ClaudeAgentExecutor({ query: testModeQuery(real) }).execute(input(dir), new AbortController().signal));
    expect(real.calls).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: 'result', outcome: 'failed', error: expect.stringContaining(`test mode only opens real Claude in a directory named ${REAL_CLAUDE_DIR_PREFIX}*`) });
    expect(events.some((e) => e.type === 'session')).toBe(false);
  });
});

describe('Fake Claude lc-fake-claude-*: soaks [soak:N] seconds through the real ClaudeAgentExecutor', () => {
  const fakeDir = () => mkdtempSync(join(tmpdir(), FAKE_CLAUDE_DIR_PREFIX));
  const soakInput = (cwd: string, prompt: string) => ({ ...input(cwd), prompt });

  it('soakSecondsOf: [soak:N] → N, capped at 3,600; none → 0', () => {
    expect(soakSecondsOf('task [soak:25] please')).toBe(25);
    expect(soakSecondsOf('[soak:9999]')).toBe(3600);
    expect(soakSecondsOf('no soak')).toBe(0);
  });

  it('[soak:1] → session + D-UI18 log + result succeeded "soak finished after 1 seconds" after ≥ 1 second; does not call the real query', async () => {
    const real = recordingQuery();
    const t0 = Date.now();
    const events = await all(new ClaudeAgentExecutor({ query: testModeQuery(real) }).execute(soakInput(fakeDir(), 'work [soak:1]'), new AbortController().signal));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
    expect(real.calls).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: 'session', sessionId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(events.at(-1)).toMatchObject({ type: 'result', outcome: 'succeeded', summary: 'soak finished after 1 seconds', costUsd: 0.0001 });
  });

  it('[limit] → usage_limit through the real executor, with no real query and no soak; the option resume keeps the id', async () => {
    const real = recordingQuery();
    const executor = new ClaudeAgentExecutor({ query: testModeQuery(real) });
    const events = await all(executor.execute(soakInput(fakeDir(), 'work [limit]'), new AbortController().signal));
    expect(real.calls).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: 'usage_limit', limitType: 'five_hour', message: "You've hit your limit", resetsAt: expect.any(Date) });
    const sessionId = (events[0] as { sessionId: string }).sessionId;
    const resumed = await all(executor.execute({ ...soakInput(fakeDir(), 'work'), resumeSessionId: sessionId }, new AbortController().signal));
    expect(resumed[0]).toEqual({ type: 'session', sessionId });
  });

  it('cancel during a 60-second soak → the executor ends within 3 seconds, with no result', async () => {
    const ctl = new AbortController();
    const t0 = Date.now();
    const p = all(new ClaudeAgentExecutor({ query: testModeQuery(recordingQuery()) }).execute(soakInput(fakeDir(), '[soak:60]'), ctl.signal));
    setTimeout(() => ctl.abort('cancelled'), 300);
    const events = await p;
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(events.some((e) => e.type === 'result')).toBe(false);
  });

  it('two soaking turns run in parallel (total ≈ 1 second, not 2), each with its own session', async () => {
    const ex = new ClaudeAgentExecutor({ query: testModeQuery(recordingQuery()) });
    const t0 = Date.now();
    const [a, b] = await Promise.all([1, 2].map(() => all(ex.execute(soakInput(fakeDir(), '[soak:1]'), new AbortController().signal))));
    expect(Date.now() - t0).toBeLessThan(1900);
    const sid = (ev: typeof a) => ev?.find((e) => e.type === 'session');
    expect(sid(a)).not.toEqual(sid(b));
  });
});

