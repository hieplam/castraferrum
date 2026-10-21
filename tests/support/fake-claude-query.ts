// A fake `query` of the Claude Agent SDK for ClaudeAgentExecutor (contract test + unit test): emits messages of the exact SDK 0.3.303 shape
// without opening a process, and simulates how the real Claude Code runs with STREAMING INPUT:
//   - `prompt` is a string (single-turn mode: stdin closes at once) or an async iterable (streaming input): the fake reads the input itself, records
//     the messages the executor sent (`sent`) and when the input closed (`inputClosed`, `closedAt`);
//   - when the script runs out the iterator WAITS for the input to close before it ends - the real Claude Code does not exit by itself while stdin is open (measured
//     2026-10-20, SPEC-phase-2 § Run end… fact 3). A script that throws throws at once. `endsWithoutInput` covers the case where the
//     process dies / exits without the input closing;
//   - `stopTask(id)`: recorded (with whether the input was still open). Input still open -> done at once (measured: 13 ms; Claude Code reports
//     `task_notification` `stopped` + an empty `background_tasks_changed` - and opens NO turn: the script emits whatever it
//     wants to simulate). Input already closed -> HANGS, just like the real SDK (measured: no response after 15 seconds - "a stop_task control could
//     never be delivered"). `opts.stopTask` can replace this behaviour.
//   - The console sends exactly ONE more message besides the prompt: the cleanup message at the ceiling. The fake records every message (`sent`,
//     `sentAt`) and lets the script wait with `await ctx.sentMessage(2)` before opening the cleanup turn, like the real Claude Code; when the input closes
//     without that message arriving `sentMessage` returns `null` - the script ends neatly, so an executor that sent no message
//     turns the test red at an assert instead of hanging until the timeout.
//   - The default script (`fakeQuery`, for the contract suite) is chosen by prompt:
//       `[fail]` -> result `error_during_execution`; `[long]` -> init then wait until the abortController cancels (like an agent running
//       a long command); anything else -> init -> assistant -> result success.
// Every call is recorded (`calls`) so tests can check the options the executor passed to the SDK.
import { randomUUID } from 'node:crypto';
import type { Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { QueryFn, QueryHandle } from '../../server/adapters/executors/claude/claude-agent-executor';

export type FakeCall = {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options: Options;
  /** Messages the executor sent through the input (string prompt: empty). */
  sent: SDKUserMessage[];
  /** `Date.now()` when each message in `sent` was received. */
  sentAt: number[];
  /** The input is closed (string prompt: closed from the start). */
  inputClosed: boolean;
  /** `Date.now()` when the input closed. */
  closedAt: number | null;
  /** Each `stopTask` the executor called: id, whether the input was still open at the time, `Date.now()`. */
  stopTasks: { taskId: string; inputOpen: boolean; at: number }[];
};

/** What the script uses to react to the executor. */
export type FakeCtx = {
  options: Options;
  call: FakeCall;
  /** Text of the first message the executor sent (string prompt: the prompt itself). */
  firstPrompt: Promise<string>;
  /** Resolves when the input closes. */
  inputClosed: Promise<void>;
  /** Resolves (with the first task id) when the executor calls `stopTask` for the first time. */
  stopTaskCalled: Promise<string>;
  /**
   * Text of the `n`-th message (from 1) the executor sent through the input; `null` if the input closes without that message ever arriving.
   * The 2nd message = the cleanup message.
   */
  sentMessage: (n: number) => Promise<string | null>;
};

export type FakeOptions = {
  /** When the script runs out the iterator ends at once, without waiting for the input to close (process died / exited). */
  endsWithoutInput?: boolean;
  /** Replace the `stopTask` behaviour (default: input open -> done at once, closed -> hang). */
  stopTask?: (taskId: string, call: FakeCall) => Promise<void>;
  /** A handle without `stopTask` (like `refuse` in test-mode-query). */
  noStopTask?: boolean;
};

export type FakeQuery = QueryFn & { calls: FakeCall[] };

export type FakeTask = { id: string; description: string; ambient?: boolean };

/** A hand-built message - only the fields the executor reads, cast to SDKMessage. */
export const msg = {
  init: (sessionId: string, cwd = ''): SDKMessage =>
    ({ type: 'system', subtype: 'init', session_id: sessionId, apiKeySource: 'none', cwd, tools: [], mcp_servers: [] }) as unknown as SDKMessage,
  /** `parentToolUseId` other than null = a message of a subagent (not the main stream). */
  assistant: (sessionId: string, text: string, parentToolUseId: string | null = null): SDKMessage =>
    ({ type: 'assistant', session_id: sessionId, parent_tool_use_id: parentToolUseId, message: { content: [{ type: 'text', text }] } }) as unknown as SDKMessage,
  success: (sessionId: string, result: string, cost = 0.0123, isError = false): SDKMessage =>
    ({ type: 'result', subtype: 'success', is_error: isError, result, total_cost_usd: cost, session_id: sessionId }) as unknown as SDKMessage,
  error: (sessionId: string, errors: string[], cost = 0.001): SDKMessage =>
    ({ type: 'result', subtype: 'error_during_execution', is_error: true, errors, total_cost_usd: cost, session_id: sessionId }) as unknown as SDKMessage,
  /** `system/background_tasks_changed`: the WHOLE set of live background tasks (replacing the old set outright), like the real SDK. */
  bgTasks: (sessionId: string, tasks: FakeTask[]): SDKMessage =>
    ({
      type: 'system',
      subtype: 'background_tasks_changed',
      tasks: tasks.map((t) => ({ task_id: t.id, task_type: 'local_bash', description: t.description, ...(t.ambient === undefined ? {} : { ambient: t.ambient }) })),
      uuid: randomUUID(),
      session_id: sessionId,
    }) as unknown as SDKMessage,
  taskNotification: (sessionId: string, taskId: string, status: 'completed' | 'failed' | 'stopped', summary = ''): SDKMessage =>
    ({ type: 'system', subtype: 'task_notification', task_id: taskId, status, output_file: '', summary, uuid: randomUUID(), session_id: sessionId }) as unknown as SDKMessage,
};

/** Wait until `abort` cancels. */
export const untilAborted = (abort: AbortController | undefined) =>
  new Promise<void>((resolve) => {
    if (!abort || abort.signal.aborted) return resolve();
    abort.signal.addEventListener('abort', () => resolve(), { once: true });
  });

const textOf = (m: SDKUserMessage): string => (typeof m.message.content === 'string' ? m.message.content : JSON.stringify(m.message.content));

/** A fake query that emits exactly the script message sequence (unit test of each branch), simulating streaming input as described at the top of the file. */
export function scriptedQuery(script: (ctx: FakeCtx) => AsyncGenerator<SDKMessage>, opts: FakeOptions = {}): FakeQuery {
  const calls: FakeCall[] = [];
  const fn = (params: { prompt: string | AsyncIterable<SDKUserMessage>; options: Options }): QueryHandle => {
    const call: FakeCall = { prompt: params.prompt, options: params.options, sent: [], sentAt: [], inputClosed: false, closedAt: null, stopTasks: [] };
    calls.push(call);

    let resolveFirst!: (text: string) => void;
    const firstPrompt = new Promise<string>((r) => (resolveFirst = r));
    const sentWaiters: { n: number; resolve: (text: string | null) => void }[] = [];
    const inputClosed = new Promise<void>((resolve) => {
      const closed = () => {
        call.inputClosed = true;
        call.closedAt = Date.now();
        for (const w of sentWaiters.splice(0)) w.resolve(null); // that message will never arrive now
        resolve();
      };
      const { prompt } = params;
      if (typeof prompt === 'string') {
        resolveFirst(prompt);
        closed();
        return;
      }
      void (async () => {
        for await (const m of prompt) {
          if (call.sent.length === 0) resolveFirst(textOf(m));
          call.sent.push(m);
          call.sentAt.push(Date.now());
          for (const w of sentWaiters.filter((x) => x.n === call.sent.length)) w.resolve(textOf(m));
        }
        closed();
      })();
    });
    let resolveStop!: (taskId: string) => void;
    const stopTaskCalled = new Promise<string>((r) => (resolveStop = r));
    const sentMessage = (n: number): Promise<string | null> =>
      new Promise((resolve) => {
        if (call.sent.length >= n) resolve(textOf(call.sent[n - 1]!));
        else if (call.inputClosed) resolve(null);
        else sentWaiters.push({ n, resolve });
      });
    const ctx: FakeCtx = { options: params.options, call, firstPrompt, inputClosed, stopTaskCalled, sentMessage };

    async function* run(): AsyncGenerator<SDKMessage> {
      yield* script(ctx);
      if (!opts.endsWithoutInput) await inputClosed;
    }
    const stopTask = (taskId: string): Promise<void> => {
      call.stopTasks.push({ taskId, inputOpen: !call.inputClosed, at: Date.now() });
      if (call.stopTasks.length === 1) resolveStop(taskId);
      if (opts.stopTask) return opts.stopTask(taskId, call);
      return call.inputClosed ? new Promise<void>(() => {}) : Promise.resolve();
    };
    const handle = run();
    return opts.noStopTask ? handle : Object.assign(handle, { stopTask });
  };
  return Object.assign(fn, { calls });
}

/** A fake query following the default script at the top of the file (the executor contract suite). */
export function fakeQuery(): FakeQuery {
  return scriptedQuery(async function* (ctx) {
    const prompt = await ctx.firstPrompt;
    const id = randomUUID();
    await Promise.resolve();
    yield msg.init(id, ctx.options.cwd);
    if (prompt.includes('[long]')) {
      await untilAborted(ctx.options.abortController);
      throw new Error('Claude Code process aborted by user');
    }
    if (prompt.includes('[fail]')) {
      yield msg.error(id, ['Fake SDK error']);
      return;
    }
    yield msg.assistant(id, 'working');
    yield msg.success(id, 'done');
  });
}
