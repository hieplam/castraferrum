// Data rules of a loop (SPEC § Model): validation + defaults. Errors are grouped per field so the form reports them in the right place (UC-01).
import { DomainError } from '../../shared/domain/errors';
import { isValidTimeZone, nextRuns, validate } from '../../shared/domain/schedule';
import type { ExecutorRegistry } from '../ports/executor';
import type { LoopInput, ValidationIssue } from './contracts';

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
/** Phase 2: the real console only keeps the `claude` executor — project owner 2026-10-19: "delete mock too" (Mock is for tests only). */
export const DEFAULT_EXECUTOR = 'claude';
export const LIMITS = { name: 80, description: 500, prompt: 20_000, timeoutMin: 60, timeoutMax: 86_400, maxConcurrentMin: 1, maxConcurrentMax: 10 } as const;

/** Validated data: cron normalised, executor config filled with defaults. */
export type CleanLoopInput = {
  name: string;
  description: string;
  prompt: string;
  repoId: string;
  cron: string;
  timezone: string;
  /** `null` = unlimited. */
  timeoutSec: number | null;
  /** Maximum parallel runs, 1–10. */
  maxConcurrent: number;
  executorKind: string;
  executorConfig: unknown;
};

const len = (s: string) => [...s].length; // count characters like Postgres length(), not UTF-16 units

/** `repoExists`: whether `input.repoId` is in the repo table (the service looks it up first — this function is synchronous). */
export function cleanLoopInput(input: LoopInput, executors: ExecutorRegistry, repoExists: boolean): CleanLoopInput {
  const issues: ValidationIssue[] = [];
  const add = (field: ValidationIssue['field'], code: ValidationIssue['code'], message: string) =>
    issues.push({ field, code, message });

  const name = (input.name ?? '').trim();
  if (name === '') add('name', 'required', 'The loop needs a name');
  else if (len(name) > LIMITS.name) add('name', 'tooLong', `The name can be at most ${LIMITS.name} characters`);

  const description = input.description ?? '';
  if (len(description) > LIMITS.description) add('description', 'tooLong', `The description can be at most ${LIMITS.description} characters`);

  const prompt = input.prompt ?? '';
  if (prompt.trim() === '') add('prompt', 'required', 'The prompt is required');
  else if (len(prompt) > LIMITS.prompt) add('prompt', 'tooLong', `The prompt can be at most ${LIMITS.prompt} characters`);

  const repoId = (input.repoId ?? '').trim();
  if (repoId === '') add('repoId', 'required', 'Choose a repo');
  else if (!repoExists) add('repoId', 'unknownRepo', `No such repo ${repoId}`);

  const cronCheck = validate(input.cron ?? '');
  if (!cronCheck.ok) add('cron', cronCheck.error.code === 'empty' ? 'required' : 'invalid', cronCheck.error.message);

  const timezone = input.timezone ?? DEFAULT_TIMEZONE;
  if (!isValidTimeZone(timezone)) add('timezone', 'invalid', `Invalid time zone "${timezone}"`);

  // Empty / null = unlimited (SPEC-phase-2 — a "fix issues until none are left" loop runs for a whole week).
  const timeoutSec = input.timeoutSec ?? null;
  if (timeoutSec !== null && (!Number.isInteger(timeoutSec) || timeoutSec < LIMITS.timeoutMin || timeoutSec > LIMITS.timeoutMax)) {
    add('timeoutSec', 'outOfRange', `The time limit must be a whole number of seconds, ${LIMITS.timeoutMin}–${LIMITS.timeoutMax}`);
  }

  // Empty / null = 1 (no overlapping runs — the old rule of UC-12).
  const maxConcurrent = input.maxConcurrent ?? 1;
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < LIMITS.maxConcurrentMin || maxConcurrent > LIMITS.maxConcurrentMax) {
    add('maxConcurrent', 'outOfRange', `The number of parallel runs must be a whole number, ${LIMITS.maxConcurrentMin}–${LIMITS.maxConcurrentMax}`);
  }

  const executorKind = input.executor?.kind ?? DEFAULT_EXECUTOR;
  let executorConfig: unknown = null;
  const executor = executors.find(executorKind);
  if (!executor) add('executor.kind', 'unknownExecutor', `No such executor "${executorKind}"`);
  else {
    const parsed = executor.describe().configSchema.safeParse(input.executor?.config ?? {});
    if (parsed.success) executorConfig = parsed.data;
    else {
      for (const issue of parsed.error.issues) {
        const path = issue.path.map(String).join('.');
        add(`executor.config${path ? `.${path}` : ''}`, 'invalid', issue.message);
      }
    }
  }

  if (issues.length > 0) throw new DomainError('VALIDATION_FAILED', 'Invalid loop data', { issues });
  return {
    name,
    description,
    prompt,
    repoId,
    cron: cronCheck.ok ? cronCheck.cron : '',
    timezone,
    timeoutSec,
    maxConcurrent,
    executorKind,
    executorConfig,
  };
}

/**
 * 00:00 of the day containing `at` in the `timezone` time zone ("today" of the overview bar). Takes the last `0 0 * * *`
 * mark `<= at` through the same schedule function (croner), so a daylight-saving day without a 00:00 still yields a valid start of day.
 */
export function startOfDay(at: Date, timezone: string): Date {
  const marks = nextRuns('0 0 * * *', timezone, new Date(at.getTime() - 26 * 3_600_000), 3).filter((d) => d <= at);
  const last = marks.at(-1);
  if (!last) throw new Error(`Could not find 00:00 of ${at.toISOString()} in ${timezone}`);
  return last;
}

/** The first cron mark AFTER `from` (a mark exactly at `from` does not count) in the loop's time zone. */
export function nextRunAfter(cron: string, timezone: string, from: Date): Date {
  const [next] = nextRuns(cron, timezone, from, 1);
  if (!next) throw new Error(`Schedule "${cron}" has no run left after ${from.toISOString()}`);
  return next;
}
