import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { query as sdkQuery, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { QueryFn, QueryHandle } from './claude-agent-executor';

// Test mode (LOOPS_TEST_MODE=1): the real console only has the Claude executor left, so test data (preview-screenshot
// seeds, e2e loops) are all `claude` loops. When the ticker reaches the turn of such a loop it would open REAL Claude Code,
// bypassPermissions, in that repo's directory (e.g. the preview's sample repo points at the real Atlas repo). Guard: test mode
// only opens real Claude when the working directory name starts with REAL_CLAUDE_DIR_PREFIX (e2e @UC-22 creates such a temp
// directory); otherwise the turn fails immediately, without spending the subscription. The executor still checks
// "repo does not exist" before calling `query` (UC-23 does not need real Claude).
//
// FAKE Claude: a directory whose name starts with FAKE_CLAUDE_DIR_PREFIX → a fake `query` inside the server, no
// process is opened, yet it still goes through the whole ClaudeAgentExecutor (streaming input, session id, summary, cost,
// cancel). A prompt with `[soak:N]` → "soaks" for N seconds and then finishes (SPEC-phase-2 § Running N turns in
// parallel) - e2e UC-32 uses it to keep many turns running at the same time.

export const REAL_CLAUDE_DIR_PREFIX = 'lc-real-claude-';
export const FAKE_CLAUDE_DIR_PREFIX = 'lc-fake-claude-';

export function testModeQuery(real: QueryFn = sdkQuery as QueryFn): QueryFn {
  return (params) => {
    const cwd = params.options.cwd ?? '';
    const dir = cwd.split(/[\\/]/).filter(Boolean).pop() ?? '';
    if (dir.startsWith(FAKE_CLAUDE_DIR_PREFIX)) return fakeSoak(params);
    return dir.startsWith(REAL_CLAUDE_DIR_PREFIX) ? real(params) : refuse(cwd);
  };
}

// eslint-disable-next-line require-yield
async function* refuse(cwd: string): AsyncGenerator<never> {
  throw new Error(`test mode only opens real Claude in a directory named ${REAL_CLAUDE_DIR_PREFIX}* (cwd: ${cwd})`);
}

/** Soak seconds of the prompt (`[soak:N]`, 0-3,600); none → 0. */
export function soakSecondsOf(prompt: string): number {
  const m = /\[soak:(\d{1,4})\]/.exec(prompt);
  return m ? Math.min(3600, Number(m[1])) : 0;
}

/**
 * Fake `query`: reads the first message of the input (keeps reading later messages in the background, like Claude Code
 * reads stdin), emits `system/init` (new session id) → one assistant sentence → soak → `result` success. Cancelling
 * (`abortController`) during the soak → throws an error like the real SDK when the process is killed.
 */
function fakeSoak(params: Parameters<QueryFn>[0]): QueryHandle {
  const abort = params.options.abortController;
  return (async function* (): AsyncGenerator<SDKMessage> {
    const prompt = await firstText(params.prompt);
    const sessionId = randomUUID();
    const seconds = soakSecondsOf(prompt);
    if (prompt.includes(ECHO_ENV)) echoLaneEnv(params.options);
    yield { type: 'system', subtype: 'init', session_id: sessionId, apiKeySource: 'none', cwd: params.options.cwd ?? '', tools: [], mcp_servers: [] } as unknown as SDKMessage;
    yield { type: 'assistant', session_id: sessionId, parent_tool_use_id: null, message: { content: [{ type: 'text', text: `soaking for ${seconds} seconds` }] } } as unknown as SDKMessage;
    await sleep(seconds * 1000, abort?.signal);
    if (abort?.signal.aborted) throw new Error('Claude Code process aborted by user');
    yield { type: 'result', subtype: 'success', is_error: false, result: `soak finished after ${seconds} seconds`, total_cost_usd: 0.0001, session_id: sessionId } as unknown as SDKMessage;
  })();
}

/** Prompt `[echo-env]`: the run writes the lane env that it got, one JSON line, to `<cwd>/lane-env.jsonl` (P6 oracle). */
export const ECHO_ENV = '[echo-env]';

function echoLaneEnv(options: Parameters<QueryFn>[0]['options']): void {
  const lane = Object.entries(options.env ?? {}).filter(([name, value]) => /^(CASTRAFERRUM_|LANE_)/.test(name) && value !== undefined);
  appendFileSync(join(options.cwd ?? '.', 'lane-env.jsonl'), `${JSON.stringify(Object.fromEntries(lane))}\n`);
}

function firstText(prompt: string | AsyncIterable<SDKUserMessage>): Promise<string> {
  if (typeof prompt === 'string') return Promise.resolve(prompt);
  return new Promise((resolve) => {
    void (async () => {
      let first = true;
      for await (const m of prompt) {
        if (!first) continue;
        first = false;
        resolve(typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message.content));
      }
      if (first) resolve('');
    })();
  });
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted || ms <= 0) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}
