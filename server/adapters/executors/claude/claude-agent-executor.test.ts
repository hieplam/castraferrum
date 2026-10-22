// ClaudeAgentExecutor's own behaviour (SPEC-phase-2 § One Claude turn + § A turn ends when Claude Code exits on its own, and
// § Rules of the `claude` executor steps 1-5 - the cleanup message when over the ceiling), with a fake `query` - no process is opened. Behaviour on a
// real Claude Code process: claude-agent-executor.real.test.ts.
// The shared contract part (every executor) lives in tests/contract/executor.contract.ts (executor-claude.test.ts).
// Cases (a)-(j) of T2 and (e1)-(e11) of T2 in PLAN.md are numbered in the test names for cross-reference (a letter after the number = a case added beyond the
// plan: (e2b) (e2c) (e3b) (e4b) (e4c)). Real Claude Code does NOT open any turn after `stopTask` (measured 20/10/2026), so in (e1) the console sends a
// cleanup message so the agent gets a last turn; (e2) keeps the scenario "some Claude Code version opens a turn itself after stopping" - then the console
// sends nothing. Stub check with 19 executor mutations: the wiki raw note on the over-ceiling cleanup message §9.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it, vi } from 'vitest';
import type { ExecutionEvent, ExecutionInput } from '../../../ports/executor';
import { msg, scriptedQuery, untilAborted, type FakeCtx, type FakeOptions, type FakeQuery } from '../../../../tests/support/fake-claude-query';
import { ClaudeAgentExecutor, claudeConfigSchema, cleanupMessage, formatWait, type ClaudeAgentExecutorOptions } from './claude-agent-executor';

const repo = () => mkdtempSync(join(tmpdir(), 'lc-claude-unit-'));
const input = (over: Partial<ExecutionInput> = {}): ExecutionInput => ({
  runId: 'r',
  loopId: 'l',
  executionId: 'e',
  iteration: 3,
  prompt: 'Do the work',
  config: {},
  cwd: repo(),
  ...over,
});

async function all(it: AsyncIterable<ExecutionEvent>): Promise<ExecutionEvent[]> {
  const out: ExecutionEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
const logs = (events: ExecutionEvent[]) => events.filter((e) => e.type === 'log').map((e) => (e as { message: string }).message);
const results = (events: ExecutionEvent[]) => events.filter((e) => e.type === 'result');

// The four clock marks scaled down (defaults 30 minutes / 120 seconds / 60 seconds / 10 minutes); 1000 ms is exactly "1 second" so the error text reads well.
const FAST = { bgWaitCeilingMs: 1000, stopGraceMs: 400, settleMs: 150, cleanupMs: 1500 };

/** Runs the turn, collecting events AS SOON AS they arrive - so the test can see the state IN THE MIDDLE of the turn. */
function start(q: FakeQuery, over: Partial<ClaudeAgentExecutorOptions> = {}, inp: ExecutionInput = input(), signal: AbortSignal = new AbortController().signal) {
  const events: ExecutionEvent[] = [];
  const t0 = Date.now();
  const done = (async () => {
    for await (const e of new ClaudeAgentExecutor({ query: q, ...FAST, ...over }).execute(inp, signal)) events.push(e);
  })();
  return { events, done, t0 };
}

describe('ClaudeAgentExecutor', () => {
  it('default config is opus / medium; a model or effort outside the list is rejected', () => {
    expect(claudeConfigSchema.parse({})).toEqual({ model: 'opus', effort: 'medium' });
    expect(claudeConfigSchema.safeParse({ model: 'haiku', effort: 'xhigh' }).success).toBe(true);
    expect(claudeConfigSchema.safeParse({ model: 'claude-opus-4' }).success).toBe(false);
    expect(claudeConfigSchema.safeParse({ effort: 'ultra' }).success).toBe(false);
    expect(new ClaudeAgentExecutor().describe()).toMatchObject({ kind: 'claude', label: 'Claude (Agent SDK)' });
  });

  it('repo does not exist → failed "Repo does not exist: <path>", no session is opened', async () => {
    const q = scriptedQuery(async function* () {
      yield msg.init('x');
    });
    const gone = repo();
    rmSync(gone, { recursive: true });
    const events = await all(new ClaudeAgentExecutor({ query: q }).execute(input({ cwd: gone }), new AbortController().signal));
    expect(q.calls).toHaveLength(0);
    expect(events).toEqual([
      { type: 'log', level: 'error', message: `Error · Repo does not exist: ${gone}` },
      { type: 'result', outcome: 'failed', error: `Repo does not exist: ${gone}` },
    ]);
  });

  it('empty cwd (programming error - phase 2 always passes the repo path) → failed, no session is opened', async () => {
    const q = scriptedQuery(async function* () {
      yield msg.init('x');
    });
    const events = await all(new ClaudeAgentExecutor({ query: q }).execute(input({ cwd: '' }), new AbortController().signal));
    expect(q.calls).toHaveLength(0);
    expect(events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: 'Turn has no repo directory (cwd)' });
  });

  it('cwd is a file, not a directory → Repo does not exist', async () => {
    const q = scriptedQuery(async function* () {});
    const file = join(tmpdir(), 'package.json-is-not-a-directory');
    const events = await all(new ClaudeAgentExecutor({ query: q }).execute(input({ cwd: file }), new AbortController().signal));
    expect(events.at(-1)).toMatchObject({ outcome: 'failed', error: `Repo does not exist: ${file}` });
  });

  it('the log has only the console\'s own lines: the agent\'s assistant / tool calls do not enter the log; summary is cut to 500 characters', async () => {
    const long = '😀'.repeat(600);
    const q = scriptedQuery(async function* () {
      yield msg.init('s-1');
      yield msg.assistant('s-1', 'calling Bash…');
      yield { type: 'user', session_id: 's-1', message: { content: [{ type: 'tool_result', content: 'ok' }] } } as never;
      yield msg.success('s-1', `  ${long}  `, 1.5);
    });
    const events = await all(new ClaudeAgentExecutor({ query: q }).execute(input(), new AbortController().signal));
    expect(events).toEqual([
      { type: 'session', sessionId: 's-1' },
      { type: 'log', level: 'info', message: 'Start round #3 · session s-1' },
      { type: 'log', level: 'info', message: 'End · Success · $1.50' },
      { type: 'result', outcome: 'succeeded', summary: '😀'.repeat(500), costUsd: 1.5 },
    ]);
  });

  it('result success but is_error (e.g. "Invalid API key", "Not logged in") → failed with the SDK\'s text', async () => {
    const q = scriptedQuery(async function* () {
      yield msg.init('s-2');
      yield msg.success('s-2', 'Not logged in · Please run /login', 0, true);
    });
    const events = await all(new ClaudeAgentExecutor({ query: q }).execute(input(), new AbortController().signal));
    expect(events.slice(2)).toEqual([
      { type: 'log', level: 'error', message: 'Error · Not logged in · Please run /login' },
      { type: 'log', level: 'info', message: 'End · Error · $0.00' },
      { type: 'result', outcome: 'failed', error: 'Not logged in · Please run /login', costUsd: 0 },
    ]);
  });

  it('error result (subtype error_*) → failed, error = subtype + errors[]', async () => {
    const q = scriptedQuery(async function* () {
      yield msg.init('s-3');
      yield msg.error('s-3', ['out of turns', 'lost network'], 0.2);
    });
    const events = await all(new ClaudeAgentExecutor({ query: q }).execute(input(), new AbortController().signal));
    expect(events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: 'error_during_execution · out of turns · lost network', costUsd: 0.2 });
  });

  it('the SDK throws AFTER an error result (behaviour measured on 0.3.303) → does not leak out: the result is the last event', async () => {
    const q = scriptedQuery(async function* () {
      yield msg.init('s-4');
      yield msg.success('s-4', 'Invalid API key · Fix external API key', 0, true);
      throw new Error('Claude Code returned an error result: Invalid API key');
    });
    const events = await all(new ClaudeAgentExecutor({ query: q }).execute(input(), new AbortController().signal));
    expect(events.at(-1)).toMatchObject({ type: 'result', outcome: 'failed', error: 'Invalid API key · Fix external API key' });
  });

  it('process dies mid-turn (the SDK throws) → error log + failed', async () => {
    const q = scriptedQuery(async function* () {
      yield msg.init('s-5');
      throw new Error('Claude Code process exited with code 1');
    });
    const events = await all(new ClaudeAgentExecutor({ query: q }).execute(input(), new AbortController().signal));
    expect(events.slice(2)).toEqual([
      { type: 'log', level: 'error', message: 'Error · Claude error: Claude Code process exited with code 1' },
      { type: 'result', outcome: 'failed', error: 'Claude error: Claude Code process exited with code 1' },
    ]);
  });

  it('the SDK runs out of messages without a result → failed', async () => {
    const q = scriptedQuery(
      async function* () {
        yield msg.init('s-6');
      },
      { endsWithoutInput: true }, // the process exits at once, without waiting for the input to close
    );
    const events = await all(new ClaudeAgentExecutor({ query: q }).execute(input(), new AbortController().signal));
    expect(events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: 'Claude finished without reporting a result' });
  });

  it('aborting the signal → the SDK\'s abortController is aborted (kills the child process)', async () => {
    const q = scriptedQuery(async function* ({ options }) {
      yield msg.init('s-7');
      await untilAborted(options.abortController);
    });
    const ctrl = new AbortController();
    const it = new ClaudeAgentExecutor({ query: q }).execute(input(), ctrl.signal)[Symbol.asyncIterator]();
    await it.next();
    await it.next();
    const rest = it.next();
    ctrl.abort('cancelled');
    await expect(rest).resolves.toEqual({ value: undefined, done: true });
    expect(q.calls[0]!.options.abortController!.signal.aborted).toBe(true);
  });

  it('the child process env = the base env minus ANTHROPIC_API_KEY (the base env is not modified)', async () => {
    const q = scriptedQuery(async function* () {
      yield msg.init('s-8');
      yield msg.success('s-8', 'xong');
    });
    const base = { PATH: 'p', ANTHROPIC_API_KEY: 'sk-gia', HOME: 'h' };
    await all(new ClaudeAgentExecutor({ query: q, env: () => base }).execute(input(), new AbortController().signal));
    expect(q.calls[0]!.options.env).toEqual({ PATH: 'p', HOME: 'h' });
    expect(base.ANTHROPIC_API_KEY).toBe('sk-gia');
  });
});

// ---- the turn only ends when Claude Code exits on its own - waiting for background tasks ------------------------------------------------

describe('ClaudeAgentExecutor — waiting for background tasks', () => {
  it('(a) one turn, no background tasks → input closes right after the result; succeeded with that result\'s summary / cost; exactly 1 message sent', async () => {
    let resultAt = 0;
    const q = scriptedQuery(async function* () {
      yield msg.init('s-a');
      yield msg.assistant('s-a', 'working');
      resultAt = Date.now();
      yield msg.success('s-a', 'xong', 0.5);
    });
    const r = start(q, {}, input({ prompt: 'Task of the round' }));
    await r.done;
    const call = q.calls[0]!;
    expect(call.sent).toEqual([{ type: 'user', message: { role: 'user', content: 'Task of the round' }, parent_tool_use_id: null, session_id: '' }]);
    expect(call.inputClosed).toBe(true);
    expect(call.closedAt! - resultAt).toBeLessThan(FAST.settleMs); // closes right at the result, not waiting for the safety net
    expect(r.events).toEqual([
      { type: 'session', sessionId: 's-a' },
      { type: 'log', level: 'info', message: 'Start round #3 · session s-a' },
      { type: 'log', level: 'info', message: 'End · Success · $0.50' },
      { type: 'result', outcome: 'succeeded', summary: 'xong', costUsd: 0.5 },
    ]);
  });

  it('(b) result #1 while background tasks remain → the turn is kept, input not closed; task finishes + new turn + result #2 → succeeded with result #2\'s text and cost', async () => {
    const gate = deferred();
    let inputOpenAfterEmpty: boolean | null = null;
    let inputOpenDuringWakeTurn: boolean | null = null;
    const q = scriptedQuery(async function* ({ call }) {
      yield msg.init('s-b');
      yield msg.bgTasks('s-b', [{ id: 't1', description: 'npm run verify' }]);
      yield msg.success('s-b', 'STILL WAITING verify', 0.1); // result #1
      await gate.promise; // the test signals "the background task has finished"
      // Order measured when a background task finishes (SPEC fact 3): task_notification → background_tasks_changed [] → system/init.
      yield msg.taskNotification('s-b', 't1', 'completed', 'npm run verify');
      yield msg.bgTasks('s-b', []);
      await sleep(30); // enough for an executor that closes the input as soon as the set becomes empty (wrong rule) to do so, BEFORE the notification turn starts
      inputOpenAfterEmpty = !call.inputClosed;
      yield msg.init('s-b'); // Claude Code opens a turn itself to wake the agent - the console sends nothing
      yield msg.assistant('s-b', 'reading output');
      await sleep(FAST.settleMs * 2); // a turn longer than the safety net: the new turn must cancel the settle timer
      inputOpenDuringWakeTurn = !call.inputClosed;
      yield msg.success('s-b', 'ALL DONE verify green', 0.3); // result #2: total_cost_usd is cumulative, take this number (do not add 0.1 + 0.3)
    });
    const r = start(q);
    await sleep(FAST.settleMs + 100); // longer than the safety net; no task has finished yet
    expect(results(r.events), 'no result while background tasks remain').toHaveLength(0);
    expect(q.calls[0]!.inputClosed, 'input still open').toBe(false);
    expect(logs(r.events)).toEqual(['Start round #3 · session s-b']);
    gate.resolve();
    await r.done;
    expect(inputOpenAfterEmpty, 'the set becoming empty while idle does NOT close the input (the notification turn is still coming); only a result closes it').toBe(true);
    expect(inputOpenDuringWakeTurn, 'input stays open through the wake-up turn (the new turn cancels the settle timer)').toBe(true);
    expect(q.calls[0]!.inputClosed).toBe(true);
    expect(q.calls[0]!.sent).toHaveLength(1); // the console sends no second message
    expect(logs(r.events)).toEqual(['Start round #3 · session s-b', 'End · Success · $0.30']);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'succeeded', summary: 'ALL DONE verify green', costUsd: 0.3 });
  });

  it('(c) a background task set containing only ambient entries → treated as empty, input closes right after the result', async () => {
    let resultAt = 0;
    const q = scriptedQuery(async function* () {
      yield msg.init('s-c');
      yield msg.bgTasks('s-c', [{ id: 'w1', description: 'live-update watcher', ambient: true }]);
      resultAt = Date.now();
      yield msg.success('s-c', 'xong', 0.2);
    });
    const r = start(q);
    await r.done;
    expect(q.calls[0]!.closedAt! - resultAt).toBeLessThan(FAST.settleMs);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'succeeded', summary: 'xong', costUsd: 0.2 });
  });

  it('(d) the background task set becomes empty while idle with no new turn within settleMs → input closes, the turn ends with the last result', async () => {
    let emptiedAt = 0;
    const q = scriptedQuery(async function* () {
      yield msg.init('s-d');
      yield msg.bgTasks('s-d', [{ id: 't1', description: 'npm run verify' }]);
      yield msg.success('s-d', 'STILL WAITING verify', 0.1);
      emptiedAt = Date.now();
      yield msg.bgTasks('s-d', []); // the task disappears and Claude Code opens no turn
    });
    const r = start(q);
    await r.done;
    const closedAfter = q.calls[0]!.closedAt! - emptiedAt;
    expect(closedAfter, 'does not close earlier than settleMs').toBeGreaterThanOrEqual(FAST.settleMs - 30);
    expect(closedAfter, 'does close (safety net)').toBeLessThan(FAST.settleMs + 600);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'succeeded', summary: 'STILL WAITING verify', costUsd: 0.1 });
  });

  // ---- over the ceiling → the console sends ONE cleanup message so the agent gets one last turn ------------------------------------------
  // Real Claude Code does NOT wake the agent after `stopTask` (measured 20/10/2026): it only emits task_notification `stopped` +
  // `background_tasks_changed []` and then goes quiet. The fake script mimics exactly that; the cleanup turn only opens when the 2nd message arrives.

  /**
   * The cleanup message of SPEC-phase-2 (§ Rules of the `claude` executor, step 2) with a 1-second ceiling - copied by hand, NOT calling
   * `cleanupMessage`: the test compares against the spec, not against the very code under test (case (e9) also compares against the spec file).
   */
  const cleanupText = (tasks: string) =>
    `[Castraferrum] This run has waited for background tasks for more than 1 second since your last reply, so the console stopped these tasks: ${tasks}. ` +
    'This is the last turn of the run: tidy up the unfinished work (record the state so the next run can continue), do not start new background tasks, then reply briefly with what you did.';
  const userMessage = (text: string) => ({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' });
  const overCeiling = (tasks: string) => `Waited more than 1 second for background tasks - stopped: ${tasks}`;

  /** Claude Code on receiving the cleanup message: opens a turn, replies `answer`, produces a result. Returns `false` if the message never arrives. */
  async function* cleanupTurn(ctx: FakeCtx, session: string, answer: string, cost: number): AsyncGenerator<SDKMessage, boolean> {
    if ((await ctx.sentMessage(2)) === null) return false;
    yield msg.init(session);
    yield msg.assistant(session, 'cleaning up');
    yield msg.success(session, answer, cost);
    return true;
  }

  it('(e1) over the ceiling → stopTask for each task while the input is open → exactly ONE second message (the spec wording) → cleanup turn + result "CLEANED UP" → input closes right at that result → failed with the over-ceiling error, summary + cost of that result', async () => {
    let cleanupResultAt = 0;
    const q = scriptedQuery(async function* (ctx) {
      yield msg.init('s-e');
      yield msg.bgTasks('s-e', [
        { id: 'A', description: 'npm run verify' },
        { id: 'B', description: 'sleep 600' },
      ]);
      yield msg.success('s-e', 'STILL WAITING verify', 0.2);
      await ctx.stopTaskCalled;
      // Measured 20/10/2026: Claude Code stops the tasks, reports stopped + an empty set, and opens NO turn for the agent.
      yield msg.taskNotification('s-e', 'A', 'stopped', 'npm run verify');
      yield msg.taskNotification('s-e', 'B', 'stopped', 'sleep 600');
      yield msg.bgTasks('s-e', []);
      if ((await ctx.sentMessage(2)) === null) return; // the console sends no cleanup message
      yield msg.init('s-e'); // the cleanup message opens a last turn for the agent
      yield msg.assistant('s-e', 'cleaning up');
      cleanupResultAt = Date.now();
      yield msg.success('s-e', 'CLEANED UP', 0.25); // total_cost_usd is cumulative: take the number of the last result
    });
    const r = start(q);
    await r.done;
    const call = q.calls[0]!;
    expect(call.stopTasks.map((s) => [s.taskId, s.inputOpen])).toEqual([
      ['A', true],
      ['B', true],
    ]);
    expect(call.stopTasks[0]!.at - r.t0, 'does not stop earlier than the ceiling').toBeGreaterThanOrEqual(FAST.bgWaitCeilingMs - 30);
    expect(call.sent, 'prompt + exactly ONE cleanup message').toEqual([userMessage('Do the work'), userMessage(cleanupText('npm run verify, sleep 600'))]);
    expect(call.sentAt[1]! - call.stopTasks.at(-1)!.at, 'sent right after the stopTasks finish').toBeLessThan(100);
    expect(call.closedAt!, 'input stays open until the result of the cleanup turn').toBeGreaterThanOrEqual(cleanupResultAt);
    expect(call.closedAt! - cleanupResultAt, 'then closes right at that result, not waiting for the safety net').toBeLessThan(FAST.settleMs);
    expect(call.options.abortController!.signal.aborted, 'exits gracefully, not killed').toBe(false);
    const error = overCeiling('npm run verify, sleep 600');
    expect(r.events).toEqual([
      { type: 'session', sessionId: 's-e' },
      { type: 'log', level: 'info', message: 'Start round #3 · session s-e' },
      { type: 'log', level: 'error', message: `Error · ${error}` },
      { type: 'log', level: 'info', message: 'End · Error · $0.25' },
      { type: 'result', outcome: 'failed', error, summary: 'CLEANED UP', costUsd: 0.25 },
    ]);
  });

  it('(e2) Claude Code opens a turn itself after stopping, before the message can be sent → NO second message (no double wake-up); that turn is the cleanup turn, input closes right at its result', async () => {
    const stopDone = deferred();
    let resultAt = 0;
    const q = scriptedQuery(
      async function* (ctx) {
        yield msg.init('s-e2');
        yield msg.bgTasks('s-e2', [{ id: 'A', description: 'npm run verify' }]);
        yield msg.success('s-e2', 'STILL WAITING verify', 0.2);
        await ctx.stopTaskCalled;
        yield msg.taskNotification('s-e2', 'A', 'stopped', 'npm run verify');
        yield msg.bgTasks('s-e2', []);
        yield msg.init('s-e2'); // a Claude Code version that wakes the agent after stopping: a new turn starts
        yield msg.assistant('s-e2', 'cleaning up');
        await sleep(40); // the executor has read the new turn …
        stopDone.resolve(); // … only then does stopTask "finish": the agent is no longer idle so it must NOT send a message
        await sleep(80); // wait longer so a wrongly-sending executor has time to send
        resultAt = Date.now();
        yield msg.success('s-e2', 'STOPPED verify', 0.25);
      },
      { stopTask: () => stopDone.promise },
    );
    const r = start(q);
    await r.done;
    const call = q.calls[0]!;
    expect(call.stopTasks).toHaveLength(1);
    expect(call.sent, 'only the prompt').toEqual([userMessage('Do the work')]);
    expect(call.closedAt!, 'input stays open until the result of that turn').toBeGreaterThanOrEqual(resultAt);
    expect(call.closedAt! - resultAt, 'that turn is the cleanup turn: input closes right at its result').toBeLessThan(FAST.settleMs);
    const error = overCeiling('npm run verify');
    expect(logs(r.events)).toEqual(['Start round #3 · session s-e2', `Error · ${error}`, 'End · Error · $0.25']);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error, summary: 'STOPPED verify', costUsd: 0.25 });
  });

  it('(e2b) a turn Claude Code opens itself after stopping produces no result within cleanupMs → kill (deadline counted from when the turn starts), still no second message', async () => {
    const stopDone = deferred();
    const q = scriptedQuery(
      async function* (ctx) {
        yield msg.init('s-e2b');
        yield msg.bgTasks('s-e2b', [{ id: 'A', description: 'npm run verify' }]);
        yield msg.success('s-e2b', 'STILL WAITING verify', 0.2);
        await ctx.stopTaskCalled;
        yield msg.taskNotification('s-e2b', 'A', 'stopped', 'npm run verify');
        yield msg.bgTasks('s-e2b', []);
        yield msg.init('s-e2b'); // Claude Code opens a turn itself after stopping, then that turn hangs
        await sleep(40);
        stopDone.resolve(); // stopTask finishes when the agent is no longer idle
        await untilAborted(ctx.options.abortController);
        await sleep(3000);
        throw new Error('Operation aborted');
      },
      { stopTask: () => stopDone.promise },
    );
    const r = start(q, { cleanupMs: 400, stopGraceMs: 5000 });
    await r.done;
    const call = q.calls[0]!;
    const elapsed = Date.now() - r.t0;
    expect(call.sent, 'only the prompt').toEqual([userMessage('Do the work')]);
    expect(call.options.abortController!.signal.aborted).toBe(true);
    expect(elapsed, 'killed after ceiling + cleanupMs').toBeGreaterThanOrEqual(FAST.bgWaitCeilingMs + 400 - 30);
    expect(elapsed, 'does not wait for the SDK to throw').toBeLessThan(FAST.bgWaitCeilingMs + 400 + 1500);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: overCeiling('npm run verify'), summary: 'STILL WAITING verify', costUsd: 0.2 });
  });

  it('(e2c) the self-opened turn produces a result BEFORE stopTask finishes, then stopTask finishes → the process exit deadline (counted from closing the input) still applies: a process that ignores the closed input is killed', async () => {
    const stopDone = deferred();
    let resultAt = 0;
    const q = scriptedQuery(
      async function* (ctx) {
        yield msg.init('s-e2c');
        yield msg.bgTasks('s-e2c', [{ id: 'A', description: 'npm run verify' }]);
        yield msg.success('s-e2c', 'STILL WAITING verify', 0.2);
        await ctx.stopTaskCalled;
        yield msg.bgTasks('s-e2c', []);
        yield msg.init('s-e2c'); // Claude Code opens a turn itself after stopping, and that turn produces a result while stopTask has not finished yet
        yield msg.assistant('s-e2c', 'cleaning up');
        resultAt = Date.now();
        yield msg.success('s-e2c', 'STOPPED verify', 0.25);
        await sleep(100);
        stopDone.resolve(); // stopTask finishes late, after the turn has already closed the input
        await untilAborted(ctx.options.abortController); // the process ignores the closed input
        await sleep(3000);
        throw new Error('Operation aborted');
      },
      { stopTask: () => stopDone.promise },
    );
    const r = start(q); // stopGraceMs 400
    await r.done;
    const sinceResult = Date.now() - resultAt;
    expect(q.calls[0]!.sent, 'only the prompt').toEqual([userMessage('Do the work')]);
    expect(q.calls[0]!.options.abortController!.signal.aborted, 'killed because it did not exit within stopGraceMs').toBe(true);
    expect(sinceResult, 'the exit deadline is counted from closing the input').toBeGreaterThanOrEqual(FAST.stopGraceMs - 30);
    expect(sinceResult).toBeLessThan(FAST.stopGraceMs + 1500);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: overCeiling('npm run verify'), summary: 'STOPPED verify', costUsd: 0.25 });
  });

  it('(e3) the cleanup turn produces no result within cleanupMs → kill, failed with the over-ceiling error, summary + cost = the earlier result; does not wait for the SDK to throw', async () => {
    const q = scriptedQuery(async function* (ctx) {
      yield msg.init('s-e3');
      yield msg.bgTasks('s-e3', [{ id: 'A', description: 'npm run verify' }]);
      yield msg.success('s-e3', 'STILL WAITING verify', 0.2);
      await ctx.stopTaskCalled;
      yield msg.taskNotification('s-e3', 'A', 'stopped', 'npm run verify');
      yield msg.bgTasks('s-e3', []);
      if ((await ctx.sentMessage(2)) === null) return;
      yield msg.init('s-e3'); // the cleanup turn starts and then hangs: it never produces a result
      await untilAborted(ctx.options.abortController);
      await sleep(3000); // the real SDK throws "Operation aborted" ~7 seconds late after abort (measured 20/10/2026) - the executor must not wait
      throw new Error('Operation aborted');
    });
    const r = start(q, { cleanupMs: 400, stopGraceMs: 5000 }); // a long grace to tell the cleanup turn's deadline apart from the process's deadline
    await r.done;
    const call = q.calls[0]!;
    const elapsed = Date.now() - r.t0;
    expect(call.sent, 'prompt + cleanup message').toHaveLength(2);
    expect(call.options.abortController!.signal.aborted).toBe(true);
    expect(elapsed, 'killed exactly after ceiling + cleanupMs').toBeGreaterThanOrEqual(FAST.bgWaitCeilingMs + 400 - 30);
    expect(elapsed, 'does not wait for the SDK to throw').toBeLessThan(FAST.bgWaitCeilingMs + 400 + 1500);
    const error = overCeiling('npm run verify');
    expect(logs(r.events)).toEqual(['Start round #3 · session s-e3', `Error · ${error}`, 'End · Error · $0.20']);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error, summary: 'STILL WAITING verify', costUsd: 0.2 });
  });

  it('(e3b) the cleanup message arrives but Claude Code opens no turn (ignores the message) → still killed after cleanupMs counted from SENDING, does not hang', async () => {
    const q = scriptedQuery(async function* (ctx) {
      yield msg.init('s-e3b');
      yield msg.bgTasks('s-e3b', [{ id: 'A', description: 'npm run verify' }]);
      yield msg.success('s-e3b', 'STILL WAITING verify', 0.2);
      await ctx.stopTaskCalled;
      yield msg.taskNotification('s-e3b', 'A', 'stopped', 'npm run verify');
      yield msg.bgTasks('s-e3b', []);
      if ((await ctx.sentMessage(2)) === null) return;
      // Claude Code receives the message and stays silent: no `system/init`, nothing → only the deadline set at sending can save the turn.
      await untilAborted(ctx.options.abortController);
      await sleep(3000);
      throw new Error('Operation aborted');
    });
    const r = start(q, { cleanupMs: 400, stopGraceMs: 5000 });
    await r.done;
    const call = q.calls[0]!;
    const elapsed = Date.now() - r.t0;
    expect(call.sent, 'prompt + cleanup message').toHaveLength(2);
    expect(call.options.abortController!.signal.aborted).toBe(true);
    expect(elapsed, 'killed exactly after ceiling + cleanupMs').toBeGreaterThanOrEqual(FAST.bgWaitCeilingMs + 400 - 30);
    expect(elapsed, 'does not wait for the SDK to throw, does not wait for stopGraceMs').toBeLessThan(FAST.bgWaitCeilingMs + 400 + 1500);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: overCeiling('npm run verify'), summary: 'STILL WAITING verify', costUsd: 0.2 });
  });

  /** A cleanup turn in which the agent opens background task C again (against instructions) and then produces a result; `lingers` = Claude Code still waits for C and does not exit on its own. */
  const cleanupOpensTask = (session: string, lingers: boolean, mark: { resultAt: number }) =>
    async function* (ctx: FakeCtx): AsyncGenerator<SDKMessage> {
      yield msg.init(session);
      yield msg.bgTasks(session, [{ id: 'A', description: 'npm run verify' }]);
      yield msg.success(session, 'STILL WAITING verify', 0.2);
      await ctx.stopTaskCalled;
      yield msg.taskNotification(session, 'A', 'stopped', 'npm run verify');
      yield msg.bgTasks(session, []);
      if ((await ctx.sentMessage(2)) === null) return;
      yield msg.init(session);
      yield msg.bgTasks(session, [{ id: 'C', description: 'sleep 900' }]);
      yield msg.assistant(session, 'cleaning up');
      mark.resultAt = Date.now();
      yield msg.success(session, 'CLEANED UP (C remains)', 0.3);
      if (lingers) {
        await untilAborted(ctx.options.abortController);
        await sleep(3000);
        throw new Error('Operation aborted');
      }
    };

  it('(e4) the result of the cleanup turn where the agent opened more background tasks → stopTask them BEFORE closing the input; the process does not exit within stopGraceMs → kill', async () => {
    const mark = { resultAt: 0 };
    const q = scriptedQuery(cleanupOpensTask('s-e4', true, mark));
    const r = start(q); // stopGraceMs 400
    await r.done;
    const call = q.calls[0]!;
    const sinceResult = Date.now() - mark.resultAt;
    expect(call.stopTasks.map((s) => [s.taskId, s.inputOpen])).toEqual([
      ['A', true],
      ['C', true],
    ]);
    expect(call.stopTasks[1]!.at, 'stopTask(C) is called before the input closes').toBeLessThanOrEqual(call.closedAt!);
    expect(call.closedAt!, 'input stays open until the result').toBeGreaterThanOrEqual(mark.resultAt);
    expect(call.closedAt! - mark.resultAt, 'then closes right at the result').toBeLessThan(FAST.settleMs);
    expect(sinceResult, 'killed stopGraceMs after the input closed').toBeGreaterThanOrEqual(FAST.stopGraceMs - 30);
    expect(sinceResult, 'does not wait for the SDK to throw').toBeLessThan(FAST.stopGraceMs + 1500);
    expect(call.options.abortController!.signal.aborted).toBe(true);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: overCeiling('npm run verify'), summary: 'CLEANED UP (C remains)', costUsd: 0.3 });
  });

  it('(e4b) like (e4) but the process exits gracefully after the input closes → not killed, does not wait out stopGraceMs', async () => {
    const mark = { resultAt: 0 };
    const q = scriptedQuery(cleanupOpensTask('s-e4b', false, mark));
    const r = start(q, { stopGraceMs: 3000 });
    await r.done;
    const call = q.calls[0]!;
    expect(call.stopTasks.map((s) => [s.taskId, s.inputOpen])).toEqual([
      ['A', true],
      ['C', true],
    ]);
    expect(call.options.abortController!.signal.aborted, 'exits gracefully').toBe(false);
    expect(Date.now() - mark.resultAt, 'does not wait out stopGraceMs').toBeLessThan(1500);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: overCeiling('npm run verify'), summary: 'CLEANED UP (C remains)', costUsd: 0.3 });
  });

  it('(e4c) the result of the cleanup turn where the task set still contains the task stopped at the ceiling (not yet updated) → no second stopTask for it', async () => {
    const q = scriptedQuery(async function* (ctx) {
      yield msg.init('s-e4c');
      yield msg.bgTasks('s-e4c', [{ id: 'A', description: 'npm run verify' }]);
      yield msg.success('s-e4c', 'STILL WAITING verify', 0.2);
      await ctx.stopTaskCalled;
      if ((await ctx.sentMessage(2)) === null) return; // and does NOT emit `background_tasks_changed []`: A is still in the set
      yield msg.init('s-e4c');
      yield msg.assistant('s-e4c', 'cleaning up');
      yield msg.success('s-e4c', 'CLEANED UP', 0.3);
    });
    const r = start(q);
    await r.done;
    expect(q.calls[0]!.stopTasks.map((s) => s.taskId), 'only once for A').toEqual(['A']);
    expect(q.calls[0]!.options.abortController!.signal.aborted).toBe(false);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: overCeiling('npm run verify'), summary: 'CLEANED UP', costUsd: 0.3 });
  });

  it('(e5) stopTask throws (rejects, throws synchronously, or only one of the two tasks), or the handle has no stopTask → kill at once, does not wait out stopGraceMs, NO second message', async () => {
    const script = async function* ({ options }: FakeCtx) {
      yield msg.init('s-e5');
      yield msg.bgTasks('s-e5', [
        { id: 'A', description: 'npm run verify' },
        { id: 'B', description: 'sleep 600' },
      ]);
      yield msg.success('s-e5', 'STILL WAITING verify', 0.2);
      await untilAborted(options.abortController);
      throw new Error('Operation aborted');
    };
    const variants: FakeOptions[] = [
      { stopTask: () => Promise.reject(new Error('control request failed')) },
      {
        stopTask: () => {
          throw new Error('synchronous throw');
        },
      },
      { stopTask: (id) => (id === 'B' ? Promise.reject(new Error('B cannot be stopped')) : Promise.resolve()) },
      { noStopTask: true },
    ];
    for (const opts of variants) {
      const q = scriptedQuery(script, opts);
      const r = start(q, { stopGraceMs: 3000 }); // a long grace to tell "kill at once" apart from "wait out the grace" even on a slow machine
      await r.done;
      const elapsed = Date.now() - r.t0;
      expect(q.calls[0]!.options.abortController!.signal.aborted).toBe(true);
      expect(q.calls[0]!.sent, 'no cleanup message sent').toEqual([userMessage('Do the work')]);
      expect(elapsed).toBeGreaterThanOrEqual(FAST.bgWaitCeilingMs - 30);
      expect(elapsed, 'killed at once at the ceiling').toBeLessThan(FAST.bgWaitCeilingMs + 1500);
      expect(r.events.at(-1)).toMatchObject({ type: 'result', outcome: 'failed', error: overCeiling('npm run verify, sleep 600'), summary: 'STILL WAITING verify' });
    }
  });

  it('(e6) after the cleanup message is sent, the task set becomes empty and the cleanup turn is slower than settleMs → input STAYS OPEN until the result of that turn (no more safety net)', async () => {
    let openBeforeTurn: boolean | null = null;
    let openInTurn: boolean | null = null;
    const q = scriptedQuery(async function* (ctx) {
      yield msg.init('s-e6');
      yield msg.bgTasks('s-e6', [{ id: 'A', description: 'npm run verify' }]);
      yield msg.success('s-e6', 'STILL WAITING verify', 0.2);
      await ctx.stopTaskCalled;
      if ((await ctx.sentMessage(2)) === null) return;
      yield msg.taskNotification('s-e6', 'A', 'stopped', 'npm run verify');
      yield msg.bgTasks('s-e6', []); // an empty set AFTER the message was sent: exactly when the old safety net would arm its timer
      await sleep(FAST.settleMs * 3); // Claude Code is slow to open the cleanup turn: longer than the safety net
      openBeforeTurn = !ctx.call.inputClosed;
      yield msg.init('s-e6');
      yield msg.assistant('s-e6', 'cleaning up');
      await sleep(FAST.settleMs * 2);
      openInTurn = !ctx.call.inputClosed;
      yield msg.success('s-e6', 'CLEANED UP', 0.3);
    });
    const r = start(q, { cleanupMs: 3000 });
    await r.done;
    expect(openBeforeTurn, 'an empty set after sending the message does NOT arm the safety net: input stays open when the cleanup turn arrives late').toBe(true);
    expect(openInTurn, 'and stays open through the whole cleanup turn').toBe(true);
    expect(q.calls[0]!.sent).toHaveLength(2);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: overCeiling('npm run verify'), summary: 'CLEANED UP', costUsd: 0.3 });
  });

  it('(e7) the cleanup turn produces an ERROR result → failed with the over-ceiling error (not the error text), summary = the earlier success result, cost of the error result; input closes, stops at once', async () => {
    const q = scriptedQuery(async function* (ctx) {
      yield msg.init('s-e7');
      yield msg.bgTasks('s-e7', [{ id: 'A', description: 'npm run verify' }]);
      yield msg.success('s-e7', 'STILL WAITING verify', 0.2);
      await ctx.stopTaskCalled;
      yield msg.taskNotification('s-e7', 'A', 'stopped', 'npm run verify');
      yield msg.bgTasks('s-e7', []);
      if ((await ctx.sentMessage(2)) === null) return;
      yield msg.init('s-e7');
      yield msg.assistant('s-e7', 'cleaning up');
      yield msg.error('s-e7', ['out of turns'], 0.4);
      await untilAborted(ctx.options.abortController); // after an error result the SDK still throws (measured 0.3.303)
      throw new Error('Operation aborted');
    });
    const r = start(q, { cleanupMs: 5000, stopGraceMs: 5000 });
    await r.done;
    const call = q.calls[0]!;
    const error = overCeiling('npm run verify');
    expect(Date.now() - r.t0, 'stops right after the error result, waiting for no deadline').toBeLessThan(FAST.bgWaitCeilingMs + 1500);
    expect(call.sent, 'prompt + cleanup message').toHaveLength(2);
    expect(call.inputClosed).toBe(true);
    expect(call.options.abortController!.signal.aborted, 'the process is stopped, like any error result').toBe(true);
    expect(logs(r.events)).toEqual(['Start round #3 · session s-e7', `Error · ${error}`, 'End · Error · $0.40']);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error, summary: 'STILL WAITING verify', costUsd: 0.4 });
  });

  it('(e11) the process dies (the SDK throws) mid cleanup turn → failed with the over-ceiling error, summary + cost = the earlier result', async () => {
    const q = scriptedQuery(async function* (ctx) {
      yield msg.init('s-e11');
      yield msg.bgTasks('s-e11', [{ id: 'A', description: 'npm run verify' }]);
      yield msg.success('s-e11', 'STILL WAITING verify', 0.2);
      await ctx.stopTaskCalled;
      yield msg.taskNotification('s-e11', 'A', 'stopped', 'npm run verify');
      yield msg.bgTasks('s-e11', []);
      if ((await ctx.sentMessage(2)) === null) return;
      yield msg.init('s-e11');
      throw new Error('Claude Code process exited with code 1');
    });
    const r = start(q);
    await r.done;
    const error = overCeiling('npm run verify');
    expect(logs(r.events)).toEqual(['Start round #3 · session s-e11', `Error · ${error}`, 'End · Error · $0.20']);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error, summary: 'STILL WAITING verify', costUsd: 0.2 });
  });

  it('(e8) normal case: the background command finishes (wake-up notification, or via the safety net) → the console NEVER sends a second message and never calls stopTask', async () => {
    const woken = scriptedQuery(async function* () {
      yield msg.init('s-e8a');
      yield msg.bgTasks('s-e8a', [{ id: 't1', description: 'npm run verify' }]);
      yield msg.success('s-e8a', 'STILL WAITING', 0.1);
      await sleep(60);
      yield msg.taskNotification('s-e8a', 't1', 'completed', 'npm run verify');
      yield msg.bgTasks('s-e8a', []);
      yield msg.init('s-e8a'); // Claude Code wakes the agent itself
      yield msg.assistant('s-e8a', 'reading output');
      yield msg.success('s-e8a', 'ALL DONE', 0.2);
    });
    const settled = scriptedQuery(async function* () {
      yield msg.init('s-e8b');
      yield msg.bgTasks('s-e8b', [{ id: 't1', description: 'npm run verify' }]);
      yield msg.success('s-e8b', 'STILL WAITING', 0.1);
      yield msg.bgTasks('s-e8b', []); // an empty set with no turn: the safety net closes the input
    });
    for (const [q, summary, costUsd] of [
      [woken, 'ALL DONE', 0.2],
      [settled, 'STILL WAITING', 0.1],
    ] as const) {
      const r = start(q);
      await r.done;
      expect(q.calls[0]!.sent, 'only the prompt').toEqual([userMessage('Do the work')]);
      expect(q.calls[0]!.stopTasks).toEqual([]);
      expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'succeeded', summary, costUsd });
    }
  });

  it('(e9) cleanupMessage: verbatim the sentence in SPEC-phase-2 § Rules of the `claude` executor step 2 (re-reads the spec file, not copied by hand)', () => {
    const spec = readFileSync(join(fileURLToPath(new URL('../../../..', import.meta.url)), 'docs', 'ARCHITECTURE.md'), 'utf8').split('\n');
    const first = spec.findIndex((l) => l.trim().startsWith('> [Castraferrum]'));
    expect(first, 'the spec still has the cleanup message sentence').toBeGreaterThan(-1);
    const quote: string[] = [];
    for (let i = first; i < spec.length && spec[i]!.trim().startsWith('>'); i++) quote.push(spec[i]!.trim().replace(/^>\s?/, ''));
    const template = quote.join(' ');
    expect(template).toContain('<description 1>, <description 2>');
    expect(cleanupMessage(30 * 60_000, ['<description 1>', '<description 2>'])).toBe(template);
    // one task, ceiling in seconds
    expect(cleanupMessage(20_000, ['Sleep 600 seconds in background'])).toBe(
      template.replace('30 minutes', '20 seconds').replace('<description 1>, <description 2>', 'Sleep 600 seconds in background'),
    );
    expect(cleanupMessage(1000, ['npm run verify', 'sleep 600'])).toBe(cleanupText('npm run verify, sleep 600'));
  });

  it('(e10) aborting the signal mid cleanup turn → the iterable ends within cancelWithinMs, emits no result, abortController is aborted', async () => {
    const q = scriptedQuery(async function* (ctx) {
      yield msg.init('s-e10');
      yield msg.bgTasks('s-e10', [{ id: 'A', description: 'npm run verify' }]);
      yield msg.success('s-e10', 'STILL WAITING verify', 0.2);
      await ctx.stopTaskCalled;
      yield msg.bgTasks('s-e10', []);
      if ((await ctx.sentMessage(2)) === null) return;
      yield msg.init('s-e10'); // the cleanup turn is running …
      await untilAborted(ctx.options.abortController);
      throw new Error('Operation aborted');
    });
    const ctrl = new AbortController();
    const r = start(q, { cleanupMs: 5000, stopGraceMs: 5000 }, input(), ctrl.signal);
    await vi.waitFor(() => expect(q.calls[0]?.sent.length).toBe(2), { timeout: 3000 });
    await sleep(40); // let the executor finish reading the init of the cleanup turn
    const cancelAt = Date.now();
    ctrl.abort('cancelled'); // … then the loop is Stopped
    await r.done;
    expect(Date.now() - cancelAt).toBeLessThan(Math.min(new ClaudeAgentExecutor().describe().cancelWithinMs, 1000));
    expect(results(r.events), 'emits no result after the abort').toHaveLength(0);
    expect(q.calls[0]!.options.abortController!.signal.aborted).toBe(true);
  });

  it('(f) over the ceiling, stopTask never finishes (Claude Code ignores the command) → after stopGraceMs the abortController is aborted (process killed) → failed with the same error, no message sent, does not wait for the SDK to throw', async () => {
    const q = scriptedQuery(
      async function* ({ options }) {
        yield msg.init('s-f');
        yield msg.bgTasks('s-f', [{ id: 'A', description: 'npm run verify' }]);
        yield msg.success('s-f', 'STILL WAITING verify', 0.2);
        await untilAborted(options.abortController);
        await sleep(3000); // the real SDK throws "Operation aborted" ~7 seconds late after abort (measured 20/10/2026) - the executor must not wait
        throw new Error('Operation aborted');
      },
      { stopTask: () => new Promise<void>(() => {}) },
    );
    const r = start(q);
    await r.done;
    const call = q.calls[0]!;
    const elapsed = Date.now() - r.t0;
    expect(call.stopTasks).toHaveLength(1); // only once
    expect(call.sent, 'no message while stopTask has not finished').toEqual([userMessage('Do the work')]);
    expect(call.options.abortController!.signal.aborted).toBe(true);
    expect(elapsed, 'killed exactly after ceiling + grace').toBeGreaterThanOrEqual(FAST.bgWaitCeilingMs + FAST.stopGraceMs - 30);
    expect(elapsed, 'does not wait for the SDK to throw').toBeLessThan(FAST.bgWaitCeilingMs + FAST.stopGraceMs + 1500);
    const error = overCeiling('npm run verify');
    expect(logs(r.events)).toEqual(['Start round #3 · session s-f', `Error · ${error}`, 'End · Error · $0.20']);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error, summary: 'STILL WAITING verify', costUsd: 0.2 });
  });

  it('(g) a new turn starts before the ceiling → no stopTask call then; the timer is recomputed from the new result', async () => {
    let result1At = 0;
    let result2At = 0;
    const q = scriptedQuery(async function* (ctx) {
      yield msg.init('s-g');
      yield msg.bgTasks('s-g', [{ id: 'A', description: 'npm run verify' }]);
      result1At = Date.now();
      yield msg.success('s-g', 'STILL WAITING round 1', 0.1);
      await sleep(FAST.bgWaitCeilingMs / 2);
      yield msg.init('s-g'); // a new turn, the background task is still alive
      yield msg.assistant('s-g', 'still waiting');
      result2At = Date.now();
      yield msg.success('s-g', 'STILL WAITING round 2', 0.15);
      await ctx.stopTaskCalled;
      yield msg.taskNotification('s-g', 'A', 'stopped');
      yield msg.bgTasks('s-g', []);
      yield* cleanupTurn(ctx, 's-g', 'CLEANED UP', 0.2);
    });
    const r = start(q);
    await r.done;
    expect(q.calls[0]!.stopTasks).toHaveLength(1);
    const stopAt = q.calls[0]!.stopTasks[0]!.at;
    expect(stopAt - result1At, 'does not stop at the ceiling mark counted from result #1').toBeGreaterThanOrEqual(FAST.bgWaitCeilingMs * 1.5 - 60);
    expect(stopAt - result2At, 'the ceiling is recomputed from result #2').toBeGreaterThanOrEqual(FAST.bgWaitCeilingMs - 30);
    expect(r.events.at(-1)).toMatchObject({ type: 'result', outcome: 'failed', summary: 'CLEANED UP', costUsd: 0.2 });
  });

  it('(h) aborting the signal while waiting for background tasks → the iterable ends within cancelWithinMs, emits no result, abortController is aborted', async () => {
    const q = scriptedQuery(async function* ({ options }) {
      yield msg.init('s-h');
      yield msg.bgTasks('s-h', [{ id: 'A', description: 'npm run verify' }]);
      yield msg.success('s-h', 'STILL WAITING verify', 0.1);
      await untilAborted(options.abortController);
      throw new Error('Operation aborted');
    });
    const ctrl = new AbortController();
    const r = start(q, {}, input(), ctrl.signal);
    await vi.waitFor(() => expect(r.events.length).toBeGreaterThanOrEqual(2));
    await sleep(80); // let the executor finish reading result #1 and enter the waiting state
    const cancelAt = Date.now();
    ctrl.abort('cancelled');
    await r.done;
    const limit = new ClaudeAgentExecutor().describe().cancelWithinMs;
    expect(Date.now() - cancelAt).toBeLessThan(Math.min(limit, 1000));
    expect(results(r.events), 'emits no result after the abort').toHaveLength(0);
    expect(q.calls[0]!.options.abortController!.signal.aborted).toBe(true);
  });

  it('(i) error result while background tasks remain → failed at once as before, input closes, the process is not left waiting for background tasks', async () => {
    const q = scriptedQuery(async function* ({ options }) {
      yield msg.init('s-i');
      yield msg.bgTasks('s-i', [{ id: 'A', description: 'npm run verify' }]);
      yield msg.error('s-i', ['out of turns'], 0.2);
      await untilAborted(options.abortController); // the process stays alive waiting for background tasks until it is killed
      throw new Error('Operation aborted');
    });
    const r = start(q);
    await r.done;
    expect(Date.now() - r.t0, 'at once, not waiting for the ceiling').toBeLessThan(FAST.bgWaitCeilingMs);
    expect(q.calls[0]!.inputClosed).toBe(true);
    expect(q.calls[0]!.options.abortController!.signal.aborted).toBe(true);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'failed', error: 'error_during_execution · out of turns', costUsd: 0.2 });
  });

  it('(j) many system/init (one per turn) → only one session event + one "Start round #N" line; "End" exactly once', async () => {
    const gate = deferred();
    const q = scriptedQuery(async function* () {
      yield msg.init('s-j');
      yield msg.bgTasks('s-j', [{ id: 't1', description: 'npm run verify' }]);
      yield msg.success('s-j', 'STILL WAITING', 0.1);
      await gate.promise;
      yield msg.bgTasks('s-j', []);
      yield msg.init('s-j');
      yield msg.assistant('s-j', 'xong');
      yield msg.success('s-j', 'ALL DONE', 0.2);
    });
    const r = start(q);
    await sleep(30);
    gate.resolve();
    await r.done;
    expect(r.events.filter((e) => e.type === 'session')).toHaveLength(1);
    expect(logs(r.events)).toEqual(['Start round #3 · session s-j', 'End · Success · $0.20']);
    expect(results(r.events)).toHaveLength(1);
    expect(r.events.at(-1)).toEqual({ type: 'result', outcome: 'succeeded', summary: 'ALL DONE', costUsd: 0.2 });
  });

  it('a subagent message (parent_tool_use_id not null) does not count as an agent turn: the ceiling still runs while a background subagent is talking', async () => {
    const q = scriptedQuery(async function* (ctx) {
      yield msg.init('s-m');
      yield msg.bgTasks('s-m', [{ id: 'A', description: 'background subagent' }]);
      yield msg.success('s-m', 'STILL WAITING subagent', 0.1);
      for (let i = 0; i < 3; i++) {
        await sleep(FAST.bgWaitCeilingMs / 4);
        yield msg.assistant('s-m', 'subagent working', 'toolu_sub');
      }
      await ctx.stopTaskCalled;
      yield msg.bgTasks('s-m', []);
      yield* cleanupTurn(ctx, 's-m', 'CLEANED UP subagent', 0.12);
    });
    const r = start(q);
    await r.done;
    expect(q.calls[0]!.stopTasks.map((s) => s.taskId)).toEqual(['A']);
    expect(r.events.at(-1)).toMatchObject({ type: 'result', outcome: 'failed', summary: 'CLEANED UP subagent' });
  });

  it('process dies (the SDK throws) while waiting for background tasks after a result success → failed, keeping the text + cost already known', async () => {
    const q = scriptedQuery(async function* () {
      yield msg.init('s-p');
      yield msg.bgTasks('s-p', [{ id: 'A', description: 'npm run verify' }]);
      yield msg.success('s-p', 'STILL WAITING', 0.3);
      throw new Error('Claude Code process exited with code 1');
    });
    const r = start(q);
    await r.done;
    expect(r.events.slice(2)).toEqual([
      { type: 'log', level: 'error', message: 'Error · Claude error: Claude Code process exited with code 1' },
      { type: 'log', level: 'info', message: 'End · Error · $0.30' },
      { type: 'result', outcome: 'failed', error: 'Claude error: Claude Code process exited with code 1', summary: 'STILL WAITING', costUsd: 0.3 },
    ]);
  });

  it('formatWait: a multiple of 60,000 ms is written "N minutes", otherwise "N seconds" (rounded)', () => {
    expect(formatWait(30 * 60_000)).toBe('30 minutes');
    expect(formatWait(60_000)).toBe('1 minute');
    expect(formatWait(20_000)).toBe('20 seconds');
    expect(formatWait(90_000)).toBe('90 seconds');
    expect(formatWait(1000)).toBe('1 second');
    expect(formatWait(1500)).toBe('2 seconds');
    expect(formatWait(300)).toBe('0 seconds');
  });
});
