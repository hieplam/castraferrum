import { stat } from 'node:fs/promises';
import { query as sdkQuery, type Options, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { formatUsd, REPO_MISSING_PREFIX } from '../../../../shared/domain/cost';
import type { ExecutionEvent, ExecutionInput, ExecutorDescriptor, LoopExecutor } from '../../../ports/executor';

// Claude Agent SDK executor (SPEC-phase-2 § `claude` executor, § One Claude turn): every turn is a new Claude Code session
// via `query()`, with `cwd` = the loop's repo directory, behaving like a user who `cd`s into the repo and types `claude`:
//   - `settingSources` left empty → loads the full user/project/local settings, CLAUDE.md, memory, and the repo's skills / subagents / hooks;
//   - `systemPrompt` preset `claude_code`; always `bypassPermissions`; no maxTurns, no maxBudgetUsd;
//   - signs in with the Claude Code login already on the machine (subscription plan): drops `ANTHROPIC_API_KEY` from the child process env.
// It does not understand the agent's business (SPEC-phase-2 § Principle zero): it only writes the console's own lines, exactly
// the D-UI18 wording of the approved preview - `Start round #N · session <id>`, `End · Success · $<cost>`, `Error · <message>` (+ `End · Error ·
// $<cost>` when the SDK reports a cost) - the transcript / tool calls are stored by Claude Code itself per session_id (`claude --resume <id>`).
// Measured 19/10/2026 (SDK 0.3.303): `effort` becomes the CLI flag `--effort <level>` (the agent's Bash sees `CLAUDE_EFFORT=<level>`);
// init reports `apiKeySource: "none"` when running on the subscription plan, `"ANTHROPIC_API_KEY"` when the env still has a key (a fake key → result
// `success` with `is_error: true`, "Invalid API key"); after an error result the SDK iterator also THROWS - so an ERROR result stops immediately.
//
// A turn ends when Claude Code EXITS ON ITS OWN, not at the first `result` (SPEC-phase-2 § A turn ends when Claude Code exits
// on its own). The agent often runs a background command (`run_in_background`) and ends its turn to wait; Claude Code wakes the agent
// itself when the command finishes (new turn, new `result`), so the executor reads the iterator to the end:
//   - the input is streaming, a queue of user messages: the head is the loop's prompt; it is kept open so `Query.stopTask` can still be called (measured
//     20/10/2026: once the input is closed, `stopTask` hangs and never reaches Claude Code). Besides the prompt, the console sends exactly
//     ONE more message - the cleanup message when over the ceiling (below). When a background task FINISHES Claude Code wakes the agent
//     itself, so sending another one then would wake it twice;
//   - a `result` success only marks "idle" and remembers the summary + cost of the LAST result (`total_cost_usd` is cumulative - not added
//     again). ONLY on a `result` success where the set of background tasks (`background_tasks_changed`, minus `ambient`) is empty → close the input →
//     the process exits in <1 second;
//   - when the set becomes empty while idle, do NOT close right away: the measured order when a task finishes is `task_notification` →
//     `background_tasks_changed []` → `system/init` of the notification turn, and closing right away would cut in before that turn. Arm `settleMs`; if a new
//     turn arrives cancel it; if it expires with no new turn close the input (safety net);
//   - OVER THE CEILING - background tasks still alive more than `bgWaitCeilingMs` after the last result (SPEC § Rules of the `claude` executor, steps 1-5):
//       1. `stopTask` each task (do not `await` each one). A command that throws, a handle without `stopTask`, or a `stopTask`
//          that never finishes after `stopGraceMs` → kill, no message sent;
//       2. every `stopTask` is done and the agent is STILL IDLE → send the cleanup message, exactly once. Measured 20/10/2026: Claude Code stops the
//          task + reports `task_notification` `stopped` but does NOT wake the agent, so without this message the agent gets no
//          turn. If a new turn starts before we manage to send (a Claude Code version that wakes itself) → do not send, that turn is the cleanup turn;
//       3. from then on the input closes ONLY at the `result` of the cleanup turn (the `settleMs` safety net is dropped); at that result, if the agent opened new
//          background tasks again, `stopTask` them (no `await`) BEFORE closing the input;
//       4. deadlines: the cleanup turn has `cleanupMs` from the moment the message is sent; once the input is closed the process has `stopGraceMs` to exit.
//          Past either deadline, kill;
//       5. the turn is `failed` "Waited more than … for background tasks - stopped: …", with the summary + cost of the last result (= the cleanup reply). A
//          cleanup turn that produces an ERROR result still ends immediately with the over-ceiling error (summary = the earlier success result). Return `failed` right away when
//          killing ourselves, without waiting for the iterator to throw `Operation aborted`;
//   - an ERROR result (outside the cleanup turn), a dead process, Stop / the loop's timeout: as before (stop immediately; on cancel return at once, no
//     `result` emitted).

export const claudeConfigSchema = z.object({
  /** Claude Code alias, always pointing to the latest version. */
  model: z.enum(['opus', 'sonnet', 'haiku']).default('opus'),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
});
export type ClaudeConfig = z.infer<typeof claudeConfigSchema>;

/** What `query()` returns: the message stream + `stopTask` (the SDK's real `Query` satisfies this type). */
export type QueryHandle = AsyncIterable<SDKMessage> & { stopTask?(taskId: string): Promise<void> };

/** Exactly the SDK's `query` signature - tests inject a fake. */
export type QueryFn = (params: { prompt: string | AsyncIterable<SDKUserMessage>; options: Options }) => QueryHandle;

export type ClaudeAgentExecutorOptions = {
  /** Defaults to `query` of `@anthropic-ai/claude-agent-sdk`. */
  query?: QueryFn;
  /** Base env for the child process (default `process.env`); `ANTHROPIC_API_KEY` is always dropped. */
  env?: () => Record<string, string | undefined>;
  /** How long background tasks may remain after the last result before `stopTask` (default 30 minutes). Tests inject a small number. */
  bgWaitCeilingMs?: number;
  /**
   * Deadline of the process after the ceiling (default 120 seconds): `stopTask` never finishes, or the input is closed and the process
   * has not exited → kill.
   */
  stopGraceMs?: number;
  /** How long, after the background task set becomes empty while idle with no new turn, before closing the input (default 60 seconds). */
  settleMs?: number;
  /** How long the cleanup turn has, from the moment the cleanup message is sent, to produce a `result` before being killed (default 10 minutes). */
  cleanupMs?: number;
};

const SUMMARY_MAX = 500;
const CANCEL_WITHIN_MS = 3000;
const BG_WAIT_CEILING_MS = 30 * 60_000;
const STOP_GRACE_MS = 120_000;
const SETTLE_MS = 60_000;
const CLEANUP_MS = 10 * 60_000;

/** "30 minutes" when a multiple of 60 000 ms, otherwise "N seconds" (rounded); singular for 1. Used in the over-ceiling error. */
export function formatWait(ms: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return ms % 60_000 === 0 ? unit(ms / 60_000, 'minute') : unit(Math.round(ms / 1000), 'second');
}

/**
 * Cleanup message: the console sends it exactly once when over the ceiling, after stopping the background tasks while the agent is still idle, so the agent gets
 * one last turn. The wording is VERBATIM from SPEC-phase-2 § Rules of the `claude` executor, step 2 (a unit test re-reads the spec to prevent drift).
 * It only talks about the lifecycle - which tasks were stopped, that this is the last turn - and never touches the agent's work (principle zero).
 */
export function cleanupMessage(ceilingMs: number, stopped: readonly string[]): string {
  return (
    `[Loop Console] This run has waited for background tasks for more than ${formatWait(ceilingMs)} since your last reply, ` +
    `so the console stopped these tasks: ${stopped.join(', ')}. ` +
    'This is the last turn of the run: tidy up the unfinished work (record the state so the next run can continue), ' +
    'do not start new background tasks, then reply briefly with what you did.'
  );
}

const userMessage = (text: string): SDKUserMessage => ({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' });

export class ClaudeAgentExecutor implements LoopExecutor {
  readonly kind = 'claude';
  readonly #query: QueryFn;
  readonly #env: () => Record<string, string | undefined>;
  readonly #ceilingMs: number;
  readonly #graceMs: number;
  readonly #settleMs: number;
  readonly #cleanupMs: number;

  constructor(opts: ClaudeAgentExecutorOptions = {}) {
    this.#query = opts.query ?? (sdkQuery as QueryFn);
    this.#env = opts.env ?? (() => process.env);
    this.#ceilingMs = opts.bgWaitCeilingMs ?? BG_WAIT_CEILING_MS;
    this.#graceMs = opts.stopGraceMs ?? STOP_GRACE_MS;
    this.#settleMs = opts.settleMs ?? SETTLE_MS;
    this.#cleanupMs = opts.cleanupMs ?? CLEANUP_MS;
  }

  describe(): ExecutorDescriptor {
    return { kind: this.kind, label: 'Claude (Agent SDK)', configSchema: claudeConfigSchema, cancelWithinMs: CANCEL_WITHIN_MS };
  }

  execute(input: ExecutionInput, signal: AbortSignal): AsyncIterable<ExecutionEvent> {
    // Do not throw synchronously: every error (including a bad config) surfaces during iteration.
    return this.#run(input, signal);
  }

  async *#run(input: ExecutionInput, signal: AbortSignal): AsyncGenerator<ExecutionEvent> {
    const cfg = claudeConfigSchema.parse(input.config ?? {});
    if (signal.aborted) return;
    const missing = await missingDir(input.cwd);
    if (signal.aborted) return;
    if (missing !== null) {
      yield { type: 'log', level: 'error', message: `Error · ${missing}` };
      yield { type: 'result', outcome: 'failed', error: missing };
      return;
    }
    const ceilingMs = this.#ceilingMs;
    const graceMs = this.#graceMs;
    const settleMs = this.#settleMs;
    const cleanupMs = this.#cleanupMs;
    /** Error text of an over-ceiling turn: names the stopped tasks. */
    const overCeiling = (tasks: string[]) => `Waited more than ${formatWait(ceilingMs)} for background tasks - stopped: ${tasks.join(', ')}`;

    const env = { ...this.#env() };
    delete env.ANTHROPIC_API_KEY; // subscription plan, so API usage is never billed by accident
    const abort = new AbortController();
    // Cancel → return at once, without waiting for the SDK to clean up the process (abortController kills the child process in the background).
    let cancel!: () => void;
    const cancelled = new Promise<'aborted'>((resolve) => (cancel = () => resolve('aborted')));
    const onAbort = () => {
      abort.abort();
      cancel();
    };
    signal.addEventListener('abort', onAbort, { once: true });

    // Streaming input: a queue of user messages. The head is the loop's prompt; when over the ceiling the executor pushes exactly ONE more cleanup
    // message. Kept open until the executor closes it: Claude Code does not exit on its own while stdin is open, and once the input is closed `stopTask`
    // cannot reach it (measured 20/10/2026).
    const outbox: SDKUserMessage[] = [userMessage(input.prompt)];
    let closed = false;
    let wakeInput: (() => void) | undefined;
    async function* userInput(): AsyncGenerator<SDKUserMessage> {
      for (;;) {
        const next = outbox.shift();
        if (next) yield next;
        else if (closed) return;
        else await new Promise<void>((resolve) => (wakeInput = resolve));
      }
    }
    const sendInput = (text: string) => {
      outbox.push(userMessage(text));
      wakeInput?.();
    };

    const handle = this.#query({
      prompt: userInput(),
      options: {
        cwd: input.cwd,
        model: cfg.model,
        effort: cfg.effort,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        env,
        abortController: abort,
      },
    });
    const messages = handle[Symbol.asyncIterator]();

    // ---- Background-task wait state (SPEC-phase-2 § Rules of the `claude` executor) ----
    let sessionId: string | null = null;
    /** The last `result` success: summary + cost of the turn (total_cost_usd is cumulative across turns). */
    let last: { summary: string; costUsd: number } | null = null;
    /** Idle = the latest turn already has a `result` success; a new turn (init / assistant / user / stream_event) resets it. */
    let idle = false;
    /** Live background tasks (excluding `ambient`): task_id → description. Each `background_tasks_changed` replaces the whole set. */
    const live = new Map<string, string>();
    // (`as` on the three variables below: TypeScript does not see assignments inside closures and would narrow them to `null` / `false` forever)
    /** Not null = over the ceiling and `stopTask` already called: descriptions of the stopped tasks (for the error text + cleanup message). */
    let stopped = null as string[] | null;
    let killed = false as boolean;
    let ended = false as boolean; // the SDK iterator is exhausted / threw: the process is gone
    let ceilingTimer: NodeJS.Timeout | undefined;
    let settleTimer: NodeJS.Timeout | undefined;
    /** Process deadline after the ceiling: `stopTask` not finished (step 1), then input closed but not exited (step 4). */
    let graceTimer: NodeJS.Timeout | undefined;
    /** Deadline of the cleanup turn (step 4): from sending the cleanup message, or from when Claude Code opens a turn itself after stopping. */
    let cleanupTimer: NodeJS.Timeout | undefined;
    // unref: the timer does not keep the server process alive (the ceiling is up to 30 minutes).
    const after = (ms: number, fn: () => void) => setTimeout(fn, ms).unref();
    const stopTimers = () => {
      for (const t of [ceilingTimer, settleTimer, graceTimer, cleanupTimer]) if (t) clearTimeout(t);
      ceilingTimer = settleTimer = graceTimer = cleanupTimer = undefined;
    };
    const armGrace = () => {
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = after(graceMs, kill);
    };
    const closeNow = () => {
      if (closed) return;
      closed = true;
      if (ceilingTimer) clearTimeout(ceilingTimer);
      if (settleTimer) clearTimeout(settleTimer);
      ceilingTimer = settleTimer = undefined;
      wakeInput?.(); // the input generator sees `closed` and ends → the SDK closes stdin
    };
    let killNow!: () => void;
    const killedP = new Promise<'killed'>((resolve) => (killNow = () => resolve('killed')));
    const kill = () => {
      if (killed) return;
      killed = true;
      abort.abort();
      killNow();
    };

    // ---- Over the ceiling (steps 1-5 of the "30-minute ceiling" bullet in the spec) ----
    const stop = handle.stopTask?.bind(handle);
    /** `stopTask` of one task; a synchronous throw also becomes a rejection. */
    const stopOne = (id: string): Promise<void> => {
      try {
        return Promise.resolve(stop?.(id));
      } catch (err) {
        return Promise.reject(err);
      }
    };
    /** Background tasks already `stopTask`ed (at the ceiling, or at the end of the cleanup turn) - not stopped again. */
    const stoppedIds = new Set<string>();
    const onCeiling = () => {
      ceilingTimer = undefined;
      if (!idle || stopped !== null || live.size === 0) return;
      stopped = [...live].map(([id, description]) => description || id);
      for (const id of live.keys()) stoppedIds.add(id);
      if (!stop) return kill(); // no graceful way to stop: kill at once, send no message
      armGrace(); // kill if `stopTask` never finishes
      // Step 1: stop each task, without `await`ing each one. Step 2: when all are done send the cleanup message; if any command fails, kill.
      Promise.all([...stoppedIds].map((id) => stopOne(id)))
        .then(sendCleanup)
        .catch(kill);
    };
    /** Step 2: every `stopTask` is done. The agent is still idle (measured: Claude Code does not open a turn itself) → send the cleanup message, exactly once. */
    const sendCleanup = () => {
      // The turn is over (the self-opened turn already produced a result and the input is closed / killed / the process is gone): nobody is left to receive it, and the `graceTimer` deadline
      // is now the process's exit deadline - it must not be cleared.
      if (closed || killed || ended) return;
      if (graceTimer) clearTimeout(graceTimer); // every `stopTask` is done
      graceTimer = undefined;
      // A new turn before we manage to send (a Claude Code version that wakes the agent itself after stopping) → do NOT send, to avoid waking it twice:
      // that turn is the cleanup turn.
      if (stopped === null || !idle) return;
      cleanupTimer = after(cleanupMs, kill); // step 4: the cleanup turn has `cleanupMs` from the moment of sending
      sendInput(cleanupMessage(ceilingMs, stopped));
    };
    /**
     * Step 3: the `result` of the cleanup turn. If the agent opened new background tasks again, `stopTask` them BEFORE closing the input (once closed,
     * `stopTask` hangs - measured 20/10/2026) without `await`; then close the input, and the process has `stopGraceMs` to exit (step 4).
     */
    const finishCleanup = () => {
      if (cleanupTimer) clearTimeout(cleanupTimer);
      cleanupTimer = undefined;
      for (const id of live.keys()) {
        if (stoppedIds.has(id)) continue; // already stopped at the ceiling (the task set has not been updated yet)
        stoppedIds.add(id);
        stopOne(id).catch(kill);
      }
      closeNow();
      armGrace();
    };

    /**
     * Re-evaluate after every `result` success and every `background_tasks_changed` - but ONLY `result` closes the input right away; the set becoming empty
     * while idle only arms the `settleMs` safety net (the notification turn is still coming).
     */
    const recheck = (source: 'result' | 'tasks') => {
      if (closed || !idle) return;
      if (stopped !== null) {
        // Already over the ceiling: a `result` arriving now belongs to the cleanup turn (the console's message, or the turn Claude Code opened itself after stopping)
        // so the turn is over (step 3). A changed task set does nothing: no new ceiling timer, no safety net - the input closes only
        // at the result, so it does not cut in before the cleanup turn.
        if (source === 'result') finishCleanup();
        return;
      }
      if (live.size > 0) {
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = undefined;
        ceilingTimer ??= after(ceilingMs, onCeiling);
        return;
      }
      if (ceilingTimer) clearTimeout(ceilingTimer);
      ceilingTimer = undefined;
      // No background tasks at the moment the turn ends: done. The set just became empty while the agent is idle: Claude Code is about to open a wake-up turn
      // (init after a few dozen ms) - wait `settleMs`, and close if no new turn arrives (safety net).
      if (source === 'result') closeNow();
      else settleTimer ??= after(settleMs, closeNow);
    };
    const newTurn = () => {
      idle = false;
      if (ceilingTimer) clearTimeout(ceilingTimer);
      if (settleTimer) clearTimeout(settleTimer);
      ceilingTimer = settleTimer = undefined;
      // After the ceiling, a new turn is the cleanup turn - from the console's message, or opened by Claude Code itself (then the deadline counts from when it
      // starts). `??=`: if already armed when the message was sent, keep that mark.
      if (stopped !== null) cleanupTimer ??= after(cleanupMs, kill);
    };

    try {
      for (;;) {
        let next: IteratorResult<SDKMessage> | 'aborted' | 'killed';
        try {
          const pending = messages.next();
          pending.catch(() => {}); // if cancel / kill wins the race, a late SDK error does not become an unhandled rejection
          next = await Promise.race([pending, cancelled, killedP]);
        } catch (err) {
          ended = true;
          if (signal.aborted) return;
          if (killed || stopped !== null) break; // already decided to end because of the ceiling: the turn's error is the over-ceiling error
          // Process died / SDK threw: the turn's error, not the console's.
          stopTimers();
          yield* failed(`Claude error: ${err instanceof Error ? err.message : String(err)}`, last?.costUsd, last?.summary);
          return;
        }
        if (next === 'aborted' || signal.aborted) return;
        if (next === 'killed') break;
        if (next.done) {
          ended = true;
          break;
        }
        const m = next.value;
        if (m.type === 'system' && m.subtype === 'init') {
          newTurn();
          if (sessionId === null) {
            sessionId = m.session_id;
            yield { type: 'session', sessionId };
            if (signal.aborted) return;
            yield { type: 'log', level: 'info', message: `Start round #${input.iteration} · session ${sessionId}` };
          }
        } else if (m.type === 'system' && m.subtype === 'background_tasks_changed') {
          live.clear();
          for (const t of m.tasks) if (!t.ambient) live.set(t.task_id, t.description);
          recheck('tasks');
        } else if (m.type === 'assistant' || m.type === 'user' || m.type === 'stream_event') {
          if (isMainThread(m)) newTurn();
        } else if (m.type === 'result') {
          if (sessionId === null) {
            sessionId = m.session_id;
            yield { type: 'session', sessionId };
          }
          if (m.subtype === 'success' && !m.is_error) {
            // The turn has NOT ended yet: Claude Code may still be waiting for background tasks and then wake the agent itself (new turn, new result).
            last = { summary: cut(m.result), costUsd: m.total_cost_usd };
            idle = true;
            recheck('result');
          } else {
            const error = m.subtype === 'success' ? m.result || 'Claude reported an error' : [m.subtype, ...m.errors].join(' · ');
            stopTimers();
            // The cleanup turn produced an error result: the turn still ends because of the CEILING; the error text does not become the summary (summary = the earlier success result).
            if (stopped !== null) yield* failed(overCeiling(stopped), m.total_cost_usd, last?.summary);
            else yield* failed(error, m.total_cost_usd);
            return; // an error result stops immediately; the SDK may still throw afterwards → do not read on
          }
        }
      }
      stopTimers();
      if (signal.aborted) return;
      if (stopped !== null) {
        yield* failed(overCeiling(stopped), last?.costUsd, last?.summary);
      } else if (last) {
        yield { type: 'log', level: 'info', message: `End · Success · ${formatUsd(last.costUsd)}` };
        yield { type: 'result', outcome: 'succeeded', summary: last.summary, costUsd: last.costUsd };
      } else {
        yield* failed('Claude finished without reporting a result');
      }
    } finally {
      stopTimers();
      signal.removeEventListener('abort', onAbort);
      closeNow();
      // If the process is still there (error result, cancel, kill): stop it, so it does not sit waiting for background tasks forever.
      if (!ended || signal.aborted) abort.abort();
      // Close the SDK iterator in the background (do not wait: the process may be shutting down).
      void messages.return?.(undefined).catch(() => {});
    }
  }
}

/** The events that end a failed turn: an `Error · …` line, an `End · Error · $…` line when the cost is known, then `result` failed. */
function failed(error: string, costUsd?: number, summary?: string): ExecutionEvent[] {
  return [
    { type: 'log', level: 'error', message: `Error · ${error}` },
    ...(costUsd === undefined ? [] : [{ type: 'log', level: 'info', message: `End · Error · ${formatUsd(costUsd)}` } as const]),
    { type: 'result', outcome: 'failed', error, ...(summary === undefined ? {} : { summary }), ...(costUsd === undefined ? {} : { costUsd }) },
  ];
}

/**
 * Whether a message belongs to the main thread. A message with `parent_tool_use_id` / `agent_id` belongs to a subagent: a background subagent talking while the main
 * agent is idle is not a new turn (if counted, the ceiling timer would be cancelled and never set again).
 */
function isMainThread(m: SDKMessage): boolean {
  const x = m as { parent_tool_use_id?: string | null; agent_id?: string };
  return x.parent_tool_use_id == null && x.agent_id === undefined;
}

/** `null` when `cwd` is an existing directory; otherwise the turn's error text. */
async function missingDir(cwd: string): Promise<string | null> {
  // `cwd` has been required since phase 2 (RunService always passes the repo path); an empty string is now only a programming error.
  if (!cwd) return 'Turn has no repo directory (cwd)';
  try {
    if ((await stat(cwd)).isDirectory()) return null;
  } catch {
    // does not exist / cannot be read
  }
  return `${REPO_MISSING_PREFIX}${cwd}`;
}

function cut(text: string): string {
  const chars = [...text.trim()];
  return chars.slice(0, SUMMARY_MAX).join('');
}
