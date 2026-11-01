import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Drizzle schema = the source that generates migrations (`npm run db:generate`), exactly ARCHITECTURE.md § Data.
// The constraint "at most N runs / loop" (trigger runs_max_concurrent_per_loop —, hand-written SQL in migration 0003 because Drizzle
// cannot describe triggers), "one open execution / loop", "no duplicate names" (partial unique index) live in the DB: repositories rely
// on them instead of locking in code — the fake in adapters/memory/ simulates exactly these constraints.

const ts = (name: string) => timestamp(name, { withTimezone: true });

/** Repos registered for loops (SPEC-phase-2). Names are unique case-insensitively; paths are unique. */
export const repos = pgTable(
  'repos',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    path: text('path').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    check('repos_name_length', sql`length(${t.name}) BETWEEN 1 AND 80`),
    uniqueIndex('repos_name_unique').on(sql`lower(${t.name})`),
    unique('repos_path_unique').on(t.path),
  ],
);

export const loops = pgTable(
  'loops',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    prompt: text('prompt').notNull(),
    // Deleting a repo that loops still use → the FK blocks it (23503) → REPO_IN_USE.
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id),
    cron: text('cron').notNull(),
    timezone: text('timezone').notNull(),
    /** NULL = unlimited (SPEC-phase-2); the CHECK below lets NULL through. */
    timeoutSec: integer('timeout_sec'),
    overlapPolicy: text('overlap_policy').notNull().default('skip'),
    /** Max simultaneous `running` runs; trigger runs_max_concurrent_per_loop blocks the (N + 1)th run. */
    maxConcurrent: integer('max_concurrent').notNull().default(1),
    executorKind: text('executor_kind').notNull(),
    executorConfig: jsonb('executor_config').notNull().default({}),
    status: text('status').notNull(),
    nextRunAt: ts('next_run_at'),
    runCounter: integer('run_counter').notNull().default(0),
    executionCounter: integer('execution_counter').notNull().default(0),
    version: integer('version').notNull().default(1),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
    archivedAt: ts('archived_at'),
  },
  (t) => [
    check('loops_name_length', sql`length(${t.name}) BETWEEN 1 AND 80`),
    check('loops_timeout_range', sql`${t.timeoutSec} BETWEEN 60 AND 86400`),
    check('loops_overlap_policy', sql`${t.overlapPolicy} IN ('skip')`),
    check('loops_max_concurrent_range', sql`${t.maxConcurrent} BETWEEN 1 AND 10`),
    check('loops_status', sql`${t.status} IN ('active','stopped')`),
    check('loops_archived_is_stopped', sql`${t.archivedAt} IS NULL OR ${t.status} = 'stopped'`),
    check('loops_next_run_only_active', sql`${t.status} = 'active' OR ${t.nextRunAt} IS NULL`),
    uniqueIndex('loops_name_live').on(sql`lower(${t.name})`).where(sql`${t.archivedAt} IS NULL`),
    index('loops_by_repo').on(t.repoId),
    index('loops_due').on(t.nextRunAt).where(sql`${t.status} = 'active' AND ${t.archivedAt} IS NULL`),
  ],
);

export const loopExecutions = pgTable(
  'loop_executions',
  {
    id: uuid('id').primaryKey(),
    loopId: uuid('loop_id')
      .notNull()
      .references(() => loops.id),
    seq: integer('seq').notNull(),
    startedAt: ts('started_at').notNull(),
    endedAt: ts('ended_at'),
    endReason: text('end_reason'),
  },
  (t) => [
    check('executions_end_reason', sql`${t.endReason} IN ('stopped','server_down')`),
    check('executions_ended_has_reason', sql`(${t.endedAt} IS NULL) = (${t.endReason} IS NULL)`),
    unique('executions_loop_seq').on(t.loopId, t.seq),
    uniqueIndex('executions_one_open_per_loop').on(t.loopId).where(sql`${t.endedAt} IS NULL`),
    index('executions_by_loop').on(t.loopId, t.startedAt.desc()),
  ],
);

/** A single row; recovery uses `beat_at` as the `ended_at` of a run closed because the server stopped (D9). */
export const serverHeartbeat = pgTable(
  'server_heartbeat',
  {
    id: boolean('id').primaryKey().default(true),
    beatAt: ts('beat_at').notNull(),
  },
  (t) => [check('server_heartbeat_one_row', sql`${t.id}`)],
);

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey(),
    loopId: uuid('loop_id')
      .notNull()
      .references(() => loops.id),
    executionId: uuid('execution_id')
      .notNull()
      .references(() => loopExecutions.id),
    iteration: integer('iteration'),
    trigger: text('trigger').notNull(),
    status: text('status').notNull(),
    skipReason: text('skip_reason'),
    scheduledFor: ts('scheduled_for'),
    startedAt: ts('started_at').notNull(),
    deadlineAt: ts('deadline_at'),
    finishedAt: ts('finished_at'),
    durationMs: integer('duration_ms'),
    promptSnapshot: text('prompt_snapshot').notNull(),
    executorKind: text('executor_kind').notNull(),
    executorConfig: jsonb('executor_config').notNull(),
    summary: text('summary'),
    error: text('error'),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6, mode: 'number' }),
    sessionId: text('session_id'),
  },
  (t) => [
    check('runs_trigger', sql`${t.trigger} IN ('start','schedule')`),
    check(
      'runs_status',
      sql`${t.status} IN ('running','succeeded','failed','cancelled','timed_out','interrupted','skipped')`,
    ),
    unique('runs_loop_iteration').on(t.loopId, t.iteration),
    // each loop has at most `max_concurrent` running runs — trigger runs_max_concurrent_per_loop (migration 0003);
    // RunRepository.start relies on it to return `busy`. This index lets the trigger count quickly.
    index('runs_running_by_loop').on(t.loopId).where(sql`${t.status} = 'running'`),
    index('runs_by_loop').on(t.loopId, t.startedAt.desc()),
    index('runs_by_execution').on(t.executionId, t.startedAt),
    index('runs_overdue').on(t.deadlineAt).where(sql`${t.status} = 'running'`),
  ],
);

export const runLogs = pgTable(
  'run_logs',
  {
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id),
    seq: integer('seq').notNull(),
    at: ts('at').notNull(),
    level: text('level').notNull(),
    message: text('message').notNull(),
    data: jsonb('data'),
  },
  (t) => [primaryKey({ columns: [t.runId, t.seq] }), check('run_logs_level', sql`${t.level} IN ('info','warn','error')`)],
);

/**
 * The probe of a loop (goal-driven loop, spec 2.1 and 2.2): one row for each loop that has one. Every command is an argv array
 * with no shell. `state` and `last_line` are written by the probe tick, not by the settings API.
 */
export const loopProbes = pgTable(
  'loop_probes',
  {
    loopId: uuid('loop_id')
      .primaryKey()
      .references(() => loops.id),
    command: jsonb('command').notNull(),
    claim: jsonb('claim').notNull().default(sql`'[]'::jsonb`),
    release: jsonb('release').notNull().default(sql`'[]'::jsonb`),
    resources: jsonb('resources').notNull().default(sql`'[]'::jsonb`),
    laneEnv: jsonb('lane_env').notNull().default(sql`'{}'::jsonb`),
    laneBasePort: integer('lane_base_port'),
    restartPolicy: text('restart_policy').notNull().default('stop'),
    state: text('state').notNull().default('active'),
    lastLine: text('last_line'),
    lastProbeAt: ts('last_probe_at'),
  },
  (t) => [
    check('loop_probes_restart_policy', sql`${t.restartPolicy} IN ('stop','resume')`),
    check(
      'loop_probes_state',
      sql`${t.state} IN ('active','waiting','blocked','held','budget_limited','complete','probe_failed')`,
    ),
  ],
);

/** Notices (spec 2.6): at most one UNREAD notice for each `dedupe_key`; a read notice does not count, so the key can come back. */
export const notices = pgTable(
  'notices',
  {
    id: uuid('id').primaryKey(),
    dedupeKey: text('dedupe_key').notNull(),
    kind: text('kind').notNull(),
    // Nullable: a notice can be about the whole console. No foreign key: a notice outlives the loop it names.
    loopId: uuid('loop_id'),
    messageKey: text('message_key').notNull(),
    params: jsonb('params').notNull(),
    at: ts('at').notNull(),
    readAt: ts('read_at'),
  },
  (t) => [
    check('notices_kind', sql`${t.kind} IN ('wait','hold','blocked','gate','goal_card','probe_failed')`),
    uniqueIndex('notices_one_unread_per_key').on(t.dedupeKey).where(sql`${t.readAt} IS NULL`),
    index('notices_unread_by_time').on(t.at.desc()).where(sql`${t.readAt} IS NULL`),
  ],
);

/** The last result of each standing goal (spec 2.10). `repo` is `owner/name`, and `row_id` is a row of `goals/health.json`. */
export const standingGoals = pgTable(
  'standing_goals',
  {
    repo: text('repo').notNull(),
    rowId: text('row_id').notNull(),
    state: text('state').notNull(),
    lastLine: text('last_line'),
    lastRunAt: ts('last_run_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.repo, t.rowId] }), check('standing_goals_state', sql`${t.state} IN ('passing','failing')`)],
);

/** The GitHub issues of standing goals (spec 2.11): at most one OPEN issue for each repository and fingerprint. */
export const standingIssues = pgTable(
  'standing_issues',
  {
    id: uuid('id').primaryKey(),
    repo: text('repo').notNull(),
    rowId: text('row_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    issueNumber: integer('issue_number').notNull(),
    openedAt: ts('opened_at').notNull(),
    lastFailedAt: ts('last_failed_at').notNull(),
    failCount: integer('fail_count').notNull().default(1),
    closedAt: ts('closed_at'),
  },
  (t) => [uniqueIndex('standing_issues_one_open_per_fingerprint').on(t.repo, t.fingerprint).where(sql`${t.closedAt} IS NULL`)],
);

/** When the standing goals of a repository ran last and run next. `next_at` is empty when the cron has no later time. */
export const standingSchedule = pgTable('standing_schedule', {
  repo: text('repo').primaryKey(),
  lastAt: ts('last_at').notNull(),
  nextAt: ts('next_at'),
});
