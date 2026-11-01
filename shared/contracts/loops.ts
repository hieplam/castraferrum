// Request / response of the loop, execution, run, log, executor and schedule-preview API (SPEC section "API contract").
// The server uses it to validate requests + encode responses; the web uses the same schemas to decode and to get the types.
import { z } from 'zod';
import { RUN_STATUSES } from '../domain/run';
import { isoDate, listOf, pageOf, pageQuery } from './common';
import { repoDto } from './repos';

// ---------------------------------------------------------------- request

/**
 * Body of `POST /loops` (UC-01). Only the **types** are checked here; the data rules (length, cron, time zone, timeout range, executor
 * config, the repo must exist) are checked by the service, which returns `VALIDATION_FAILED` with `details.issues` per field. An empty
 * field takes the spec default (time zone `Asia/Ho_Chi_Minh`, executor `mock`); an empty / `null` `timeoutSec` = no
 * limit (SPEC-phase-2). `repoId` is required (missing -> `required` at field `repoId`, reported by the service together with the other fields).
 */
export const loopInputBody = z.object({
  name: z.string(),
  description: z.string().optional(),
  prompt: z.string(),
  repoId: z.string().optional(),
  cron: z.string(),
  timezone: z.string().optional(),
  timeoutSec: z.number().nullable().optional(),
  /** Maximum parallel runs, 1-10; empty / `null` = 1. */
  maxConcurrent: z.number().nullable().optional(),
  executor: z.object({ kind: z.string(), config: z.unknown().optional() }).optional(),
});
export type LoopInputBody = z.input<typeof loopInputBody>;

/** Body of `PUT /loops/:id` (UC-09): like create + the `version` being edited (optimistic lock). */
export const loopUpdateBody = loopInputBody.extend({ version: z.number().int().min(1) });
export type LoopUpdateBody = z.input<typeof loopUpdateBody>;

/**
 * `GET /loops?status=&q=&archived=&repoId=` - `archived=true` returns only archived loops, the default returns only unarchived loops;
 * `repoId` returns only the loops of that repo (UC-25).
 */
export const loopListQuery = z.object({
  status: z.enum(['active', 'stopped']).optional(),
  repoId: z.string().optional(),
  q: z.string().optional(),
  archived: z.stringbool().optional(),
});

export const loopPageQuery = pageQuery;

/** `GET /runs/:id/logs?after=` and `/logs/stream?after=` - logs with `seq > after`. */
export const logsQuery = z.object({ after: z.coerce.number().int().min(0).default(0) });

/** `GET /schedule/preview?cron=&tz=&lang=`. */
export const schedulePreviewQuery = z.object({
  cron: z.string(),
  tz: z.string().default('Asia/Ho_Chi_Minh'),
  lang: z.enum(['en', 'vi']).default('en'),
});

/** `GET /events?loopId=` - empty = every loop. */
export const eventsQuery = z.object({ loopId: z.string().optional() });

// ---------------------------------------------------------------- response

const runStatus = z.enum(RUN_STATUSES);

export const runDto = z.object({
  id: z.string(),
  loopId: z.string(),
  executionId: z.string(),
  /** Iteration #N; `null` for a skipped run. */
  iteration: z.number().int().nullable(),
  trigger: z.enum(['start', 'schedule', 'probe']),
  status: runStatus,
  skipReason: z.string().nullable(),
  scheduledFor: isoDate.nullable(),
  startedAt: isoDate,
  deadlineAt: isoDate.nullable(),
  finishedAt: isoDate.nullable(),
  durationMs: z.number().nullable(),
  promptSnapshot: z.string(),
  executorKind: z.string(),
  executorConfig: z.unknown(),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  costUsd: z.number().nullable(),
  sessionId: z.string().nullable(),
  /** The claimed task of a run that a probe started. */
  taskKey: z.string().nullable(),
  slot: z.number().int().nullable(),
  /** The `result` word and the pull request of the run-end signal. */
  endResult: z.string().nullable(),
  endPr: z.string().nullable(),
});
export type RunDto = z.output<typeof runDto>;

export const executionStatsDto = z.object({
  runs: z.number().int(),
  running: z.number().int(),
  succeeded: z.number().int(),
  /** Failed and timed out runs. */
  failed: z.number().int(),
  /** Runs a server shutdown interrupted: not a failure of the run (castraferrum#190). */
  interrupted: z.number().int(),
  cancelled: z.number().int(),
  skipped: z.number().int(),
  /** Number of runs that have a session id (the "Session id" column of the execution history). */
  sessions: z.number().int(),
  elapsedMs: z.number(),
  avgDurationMs: z.number().nullable(),
});

export const executionDto = z.object({
  id: z.string(),
  loopId: z.string(),
  /** Execution #k. */
  seq: z.number().int(),
  startedAt: isoDate,
  endedAt: isoDate.nullable(),
  endReason: z.enum(['stopped', 'server_down', 'goal_met']).nullable(),
  stats: executionStatsDto,
});
export type ExecutionDto = z.output<typeof executionDto>;

/** `GET /executions/:id` (UC-08): every run (oldest first) + session ids in run order. */
export const executionDetailDto = executionDto.extend({ runs: z.array(runDto), sessionIds: z.array(z.string()) });
export type ExecutionDetailDto = z.output<typeof executionDetailDto>;

export const loopDto = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  prompt: z.string(),
  repo: repoDto,
  cron: z.string(),
  timezone: z.string(),
  /** `null` = no limit. */
  timeoutSec: z.number().int().nullable(),
  /** Maximum number of parallel runs. */
  maxConcurrent: z.number().int(),
  executor: z.object({ kind: z.string(), config: z.unknown() }),
  status: z.enum(['active', 'stopped']),
  nextRunAt: isoDate.nullable(),
  version: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
  archivedAt: isoDate.nullable(),
  /** Total iterations over the loop's lifetime. */
  iterations: z.number().int(),
  /** Number of executions. */
  executionCount: z.number().int(),
  /** The open execution; for a stopped loop the latest one; never started -> null. */
  currentExecution: executionDto.nullable(),
  /** The newest running run (= `activeRuns[0]`). */
  activeRun: runDto.nullable(),
  /** Every running run, newest first. */
  activeRuns: z.array(runDto),
  /** The latest run that has a result (not counting running and skipped runs). */
  lastRun: runDto.nullable(),
});
export type LoopDto = z.output<typeof loopDto>;

export const loopDetailDto = loopDto.extend({
  longestExecution: z.object({ executionId: z.string(), seq: z.number().int(), elapsedMs: z.number() }).nullable(),
  /** Total runs over the loop's lifetime, skipped ones included - the denominator "1-10 / N" of the run history. */
  runCount: z.number().int(),
});
export type LoopDetailDto = z.output<typeof loopDetailDto>;

export const loopListDto = listOf(loopDto);
export const executionPageDto = pageOf(executionDto);
export const runPageDto = pageOf(runDto);

export const logLineDto = z.object({
  runId: z.string(),
  /** Increases within a run (1, 2, ...) - also the `id:` of the SSE log event. */
  seq: z.number().int(),
  at: isoDate,
  level: z.enum(['info', 'warn', 'error']),
  message: z.string(),
  data: z.unknown(),
});
export type LogLineDto = z.output<typeof logLineDto>;
export const logListDto = listOf(logLineDto);

/** `GET /executors`: `configSchema` is a JSON Schema (draft 2020-12, input form - a field with a default is not required). */
export const executorDto = z.object({
  kind: z.string(),
  label: z.string(),
  cancelWithinMs: z.number().int(),
  configSchema: z.record(z.string(), z.unknown()),
});
export type ExecutorDto = z.output<typeof executorDto>;
export const executorListDto = listOf(executorDto);

/** `GET /schedule/preview`: the description sentence + the next 5 runs + warnings. */
export const schedulePreviewDto = z.object({
  cron: z.string(),
  description: z.string(),
  nextRuns: z.array(isoDate),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
});
export type SchedulePreviewDto = z.output<typeof schedulePreviewDto>;

/**
 * `GET /stats?tz=&repoId=` (UC-03): "today" is computed in time zone `tz` (the web sends the browser's time zone). `repoId` only
 * filters `loops` (loops per tab when the list is filtered by repo - UC-25); the overview numbers are always for the whole console.
 */
export const overviewQuery = z.object({ tz: z.string().default('Asia/Ho_Chi_Minh'), repoId: z.string().optional() });

/** `GET /stats`: the overview bar + loops per tab of the list - every number is counted by the server in the DB. */
export const overviewDto = z.object({
  activeLoops: z.number().int(),
  runningRuns: z.number().int(),
  runsToday: z.number().int(),
  errors24h: z.number().int(),
  loops: z.object({ all: z.number().int(), active: z.number().int(), stopped: z.number().int(), archived: z.number().int() }),
  timezone: z.string(),
  todayFrom: isoDate,
  now: isoDate,
});
export type OverviewDto = z.output<typeof overviewDto>;

// ---------------------------------------------------------------- test mode (LOOPS_TEST_MODE=1)

/** `POST /__test/clock`: advance by `advanceMs` (negative = go back) or set exactly to the instant `at`. */
export const testClockBody = z.union([
  z.object({ advanceMs: z.number().finite() }).strict(),
  z.object({ at: isoDate }).strict(),
]);
export const testClockDto = z.object({ now: isoDate });

/** `POST /__test/dirs`: force a folder to exist (`true`) / be missing (`false`) for exactly that path string. */
export const testDirsBody = z.object({ paths: z.record(z.string(), z.boolean()) }).strict();
