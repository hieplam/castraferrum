import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query as sdkQuery, type Options, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Clock } from '../../../ports/clock';
import type { PlanWindow, PlanWindowValue } from '../../../ports/plan-window';

// The plan window (rule 6, evidence S4): `query()` with an input stream that sends no message, then the usage call. So no model turn runs, and the
// call costs nothing. It never reads `rate_limit_event`, because S4 run 2 carried no `utilization` there.

type UsageCall = 'usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET';
type UsageAnswer = Awaited<ReturnType<Query[UsageCall]>>;

/** The part of the `query` signature that this adapter uses. Tests inject a fake. */
export type UsageQueryFn = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => Pick<Query, UsageCall>;

export type ClaudePlanWindowOptions = {
  clock: Clock;
  /** Defaults to `query` of `@anthropic-ai/claude-agent-sdk`. Test mode passes a query that has no usage call, so each read gives the unknown value. */
  query?: unknown;
  /** Base env for the child process (default `process.env`). `ANTHROPIC_API_KEY` is always dropped, as in the executor. */
  env?: () => Record<string, string | undefined>;
  /** The longest wait for the answer (default 15 s). The probe tick waits for this read, so a hung call must not stop the tick. */
  timeoutMs?: number;
};

const KEEP_MS = 60_000;
const TIMEOUT_MS = 15_000;
const UNKNOWN: PlanWindowValue = { utilization: null, resetsAt: null };

/** Gives no message, and ends when the call is aborted. */
// eslint-disable-next-line require-yield
async function* silentInput(signal: AbortSignal): AsyncGenerator<SDKUserMessage> {
  await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}

/** The larger window counts, so a full week also refuses. The reset is the one of the five-hour window. */
function valueOf(answer: UsageAnswer): PlanWindowValue {
  const hours = answer.rate_limits?.five_hour;
  if (typeof hours?.utilization !== 'number') return UNKNOWN;
  const resetsAt = new Date(hours.resets_at ?? '');
  if (Number.isNaN(resetsAt.getTime())) return UNKNOWN;
  return { utilization: Math.max(hours.utilization, answer.rate_limits?.seven_day?.utilization ?? 0), resetsAt };
}

export class ClaudePlanWindow implements PlanWindow {
  readonly #clock: Clock;
  readonly #query: UsageQueryFn;
  readonly #env: () => Record<string, string | undefined>;
  readonly #timeoutMs: number;
  #kept: { value: PlanWindowValue; at: number } | null = null;
  /** The probes of one tick read together, so they share one call. */
  #pending: Promise<PlanWindowValue> | null = null;

  constructor(opts: ClaudePlanWindowOptions) {
    this.#clock = opts.clock;
    this.#query = (opts.query ?? sdkQuery) as UsageQueryFn;
    this.#env = opts.env ?? (() => process.env);
    this.#timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  }

  read(): Promise<PlanWindowValue> {
    const kept = this.#kept;
    if (kept && this.#clock.now().getTime() - kept.at < KEEP_MS) return Promise.resolve(kept.value);
    this.#pending ??= this.#fetch().finally(() => (this.#pending = null));
    return this.#pending;
  }

  async #fetch(): Promise<PlanWindowValue> {
    const value = await this.#ask().catch(() => UNKNOWN);
    this.#kept = { value, at: this.#clock.now().getTime() };
    return value;
  }

  async #ask(): Promise<PlanWindowValue> {
    const cwd = join(tmpdir(), 'lc-plan-window');
    await mkdir(cwd, { recursive: true });
    const env = { ...this.#env() };
    delete env.ANTHROPIC_API_KEY; // plan limits exist only on the subscription login
    const abort = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    try {
      // `settingSources: []`: a read must not run the hooks of the user's settings.
      const handle = this.#query({ prompt: silentInput(abort.signal), options: { tools: [], persistSession: false, cwd, env, settingSources: [], abortController: abort } });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('The usage call timed out')), this.#timeoutMs);
        timer.unref();
      });
      return valueOf(await Promise.race([handle.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }), timeout]));
    } finally {
      clearTimeout(timer);
      abort.abort(); // ends the process and the input stream
    }
  }
}
