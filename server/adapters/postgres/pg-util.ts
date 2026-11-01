import type pg from 'pg';
import type { ExecutionEndReason, LogLevel, LoopStatus, RunStatus, RunTrigger } from '../../../shared/domain/run';
import type { ExecutionRecord } from '../../ports/execution-repository';
import type { LoopRecord } from '../../ports/loop-repository';
import type { RepoRecord } from '../../ports/repo-repository';
import type { LogLine } from '../../ports/run-log-repository';
import type { RunRecord } from '../../ports/run-repository';

/** Run `fn` in a transaction on a dedicated connection; an error → ROLLBACK then rethrow. */
export async function withTx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

type PgError = { code?: string; constraint?: string };

/** Postgres constraint-violation error (unique 23505, check 23514, FK 23503) → the constraint name, undefined if it is not one. */
export function violated(err: unknown, code: '23505' | '23514' | '23503'): string | undefined {
  const e = err as PgError;
  return e && e.code === code ? (e.constraint ?? '') : undefined;
}

// JSON going into jsonb: pg stringifies objects by itself but not arrays — always stringify to be safe.
export const json = (v: unknown): string | null => (v === undefined ? null : JSON.stringify(v));

type Row = Record<string, unknown>;

export function toLoop(r: Row): LoopRecord {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    prompt: r.prompt as string,
    repoId: r.repo_id as string,
    cron: r.cron as string,
    timezone: r.timezone as string,
    timeoutSec: (r.timeout_sec as number | null) ?? null,
    overlapPolicy: r.overlap_policy as 'skip',
    maxConcurrent: r.max_concurrent as number,
    executorKind: r.executor_kind as string,
    executorConfig: r.executor_config,
    status: r.status as LoopStatus,
    nextRunAt: (r.next_run_at as Date | null) ?? null,
    runCounter: r.run_counter as number,
    executionCounter: r.execution_counter as number,
    version: r.version as number,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
    archivedAt: (r.archived_at as Date | null) ?? null,
  };
}

export function toRepo(r: Row): RepoRecord {
  return { id: r.id as string, name: r.name as string, path: r.path as string, createdAt: r.created_at as Date };
}

export function toExecution(r: Row): ExecutionRecord {
  return {
    id: r.id as string,
    loopId: r.loop_id as string,
    seq: r.seq as number,
    startedAt: r.started_at as Date,
    endedAt: (r.ended_at as Date | null) ?? null,
    endReason: (r.end_reason as ExecutionEndReason | null) ?? null,
  };
}

export function toRun(r: Row): RunRecord {
  return {
    id: r.id as string,
    loopId: r.loop_id as string,
    executionId: r.execution_id as string,
    iteration: (r.iteration as number | null) ?? null,
    trigger: r.trigger as RunTrigger,
    status: r.status as RunStatus,
    skipReason: (r.skip_reason as string | null) ?? null,
    scheduledFor: (r.scheduled_for as Date | null) ?? null,
    startedAt: r.started_at as Date,
    deadlineAt: (r.deadline_at as Date | null) ?? null,
    finishedAt: (r.finished_at as Date | null) ?? null,
    durationMs: (r.duration_ms as number | null) ?? null,
    promptSnapshot: r.prompt_snapshot as string,
    executorKind: r.executor_kind as string,
    executorConfig: r.executor_config,
    summary: (r.summary as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    // numeric as a string so no precision is lost; the money figures in phase 2 only need 6 decimal places.
    costUsd: r.cost_usd === null || r.cost_usd === undefined ? null : Number(r.cost_usd),
    sessionId: (r.session_id as string | null) ?? null,
    taskKey: (r.task_key as string | null) ?? null,
    slot: (r.slot as number | null) ?? null,
    endResult: (r.end_result as string | null) ?? null,
    endPr: (r.end_pr as string | null) ?? null,
  };
}

export function toLog(r: Row): LogLine {
  return {
    runId: r.run_id as string,
    seq: r.seq as number,
    at: r.at as Date,
    level: r.level as LogLevel,
    message: r.message as string,
    data: r.data ?? null,
  };
}
