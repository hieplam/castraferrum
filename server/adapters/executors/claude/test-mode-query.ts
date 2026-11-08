import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
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
// parallel) - e2e UC-32 uses it to keep many turns running at the same time. A prompt with `[limit]` → a rejected `rate_limit_event`, then an
// assistant `error`, then the end of the stream (spec 2.5). The option `resume` keeps its session id. A prompt with `[run-end:<word>:<value>]` ends the
// result with the run-end line of spec 2.3: `<value>` is the `resource` of `RESOURCE_DOWN`, and the `pr` of each other word.
// A prompt with `[goal-card]` plays the goal writer: it reads `card.md` in `cwd` and opens the card as an issue through the script of
// `LOOPS_GH_BIN` (`issue create --title <title> --label goal-card --body-file card.md`). Test mode only, no model, no network (W6).

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
    const sessionId = params.options.resume ?? randomUUID();
    const seconds = soakSecondsOf(prompt);
    if (prompt.includes(ECHO_ENV)) echoLaneEnv(params.options);
    const card = prompt.includes(GOAL_CARD_MARK) ? writeGoalCard(prompt, params.options.cwd ?? '.') : '';
    yield { type: 'system', subtype: 'init', session_id: sessionId, apiKeySource: 'none', cwd: params.options.cwd ?? '', tools: [], mcp_servers: [] } as unknown as SDKMessage;
    yield { type: 'assistant', session_id: sessionId, parent_tool_use_id: null, message: { content: [{ type: 'text', text: `soaking for ${seconds} seconds` }] } } as unknown as SDKMessage;
    if (prompt.includes('[limit]')) {
      yield { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: Math.floor(Date.now() / 1000) + 3600, rateLimitType: 'five_hour' }, session_id: sessionId } as unknown as SDKMessage;
      yield { type: 'assistant', error: 'rate_limit', session_id: sessionId, parent_tool_use_id: null, message: { content: [{ type: 'text', text: "You've hit your limit" }] } } as unknown as SDKMessage;
      return;
    }
    await sleep(seconds * 1000, abort?.signal);
    if (abort?.signal.aborted) throw new Error('Claude Code process aborted by user');
    yield { type: 'result', subtype: 'success', is_error: false, result: `soak finished after ${seconds} seconds${card}${runEndLineOf(prompt)}`, total_cost_usd: 0.0001, session_id: sessionId } as unknown as SDKMessage;
  })();
}

/** The line of spec 2.3 that a prompt asks for with `[run-end:<word>:<value>]`, after a line break. No mark gives an empty string. */
function runEndLineOf(prompt: string): string {
  const m = /\[run-end:(\w+):([^\]]*)\]/.exec(prompt);
  if (!m) return '';
  const [, result, value] = m;
  const down = result === 'RESOURCE_DOWN';
  return `\n${JSON.stringify({ epic: 1, issue: 1, result, pr: down ? null : value, resource: down ? value : null, progress: null, note: '' })}`;
}

/** Prompt `[goal-card]`: the run writes the card of `card.md` in its folder as a `goal-card` issue, like the goal writer does (W6 oracle). */
export const GOAL_CARD_MARK = '[goal-card]';
const GOAL_CARD_REPO = 'fake/repo';

/** Opens the card and returns a line for the run summary. A failed `gh` call throws, so the run fails and the test sees why. */
function writeGoalCard(prompt: string, cwd: string): string {
  const bin = process.env.LOOPS_GH_BIN;
  if (!bin) throw new Error('[goal-card] needs LOOPS_GH_BIN (the fake gh)');
  const file = join(cwd, 'card.md');
  const title = /"title"\s*:\s*"([^"]+)"/.exec(readFileSync(file, 'utf8'))?.[1] ?? 'Goal card';
  const repo = /\bon (\S+\/[^\s,.]+)/.exec(prompt)?.[1] ?? GOAL_CARD_REPO;
  const args = ['issue', 'create', '-R', repo, '--title', `Goal card: ${title}`, '--label', 'goal-card', '--body-file', file];
  const shell = /\.(cmd|bat)$/i.test(bin);
  const r = bin.endsWith('.mjs')
    ? spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })
    : shell
      ? spawnSync(`"${bin}" ${args.map((a) => `"${a}"`).join(' ')}`, { cwd, encoding: 'utf8', shell: true })
      : spawnSync(bin, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`[goal-card] gh failed: ${String(r.stderr || r.error?.message || r.status).trim()}`);
  return `
card opened: ${r.stdout.trim()}`;
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
