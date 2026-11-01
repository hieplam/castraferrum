import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
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
    check('executions_end_reason', sql`${t.endReason} IN ('stopped','server_down','goal_met')`),
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
    /** The claimed task of a run that a probe started. */
    taskKey: text('task_key'),
    slot: integer('slot'),
    /** The run-end signal (spec 2.3). */
    endResult: text('end_result'),
    endPr: text('end_pr'),
    /** How many times the run went on after a hold (spec 2.5). */
    resumeCount: integer('resume_count').notNull().default(0),
  },
  (t) => [
    check('runs_trigger', sql`${t.trigger} IN ('start','schedule','probe')`),
    check(
      'runs_status',
      sql`${t.status} IN ('running','succeeded','failed','cancelled','timed_out','interrupted','skipped','held')`,
    ),
    unique('runs_loop_iteration').on(t.loopId, t.iteration),
    // each loop has at most `max_concurrent` running runs — trigger runs_max_concurrent_per_loop (migration 0003);
    // RunRepository.start relies on it to return `busy`. This index lets the trigger count quickly.
    index('runs_running_by_loop').on(t.loopId).where(sql`${t.status} = 'running'`),
    index('runs_by_loop').on(t.loopId, t.startedAt.desc()),
    index('runs_by_execution').on(t.executionId, t.startedAt),
    index('runs_overdue').on(t.deadlineAt).where(sql`${t.status} = 'running'`),
    index('runs_held').on(t.startedAt, t.id).where(sql`${t.status} = 'held'`),
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

/**
 * Claims (spec 2.4, decision 23): the console holds a task of a probe loop for one run. `run_id` has no foreign key, because the row is written
 * before the run row, and a row with no run counts as orphaned. At most one open row for each loop and task key.
 */
/** A stop on a resource (spec 2.5). The name `plan-window` stops every probe loop, and any other name stops the tasks that list it. */
export const resourceHolds = pgTable(
  'resource_holds',
  {
    id: uuid('id').primaryKey(),
    resource: text('resource').notNull(),
    reason: text('reason').notNull(),
    openedAt: ts('opened_at').notNull(),
    until: ts('until'),
    checkedAt: ts('checked_at'),
    closedAt: ts('closed_at'),
    // No foreign key, like `run_claims.run_id`: a probe opens a hold with no run, and a hold outlives its run.
    openedByRunId: uuid('opened_by_run_id'),
    /** The held run that tests a window with no known end (decision 44). */
    trialRunId: uuid('trial_run_id'),
  },
  (t) => [uniqueIndex('resource_holds_one_open').on(t.resource).where(sql`${t.closedAt} IS NULL`)],
);

export const runClaims = pgTable(
  'run_claims',
  {
    id: uuid('id').primaryKey(),
    loopId: uuid('loop_id')
      .notNull()
      .references(() => loops.id),
    taskKey: text('task_key').notNull(),
    runId: uuid('run_id').notNull(),
    openedAt: ts('opened_at').notNull(),
    closedAt: ts('closed_at'),
    closeReason: text('close_reason'),
    // Decision 4: a claim has one owner, a run or the gate. The gate owns the row once it has a job (`gate_job_id`).
    owner: text('owner').notNull().default('run'),
    gateJobId: uuid('gate_job_id').references(() => gateJobs.id),
    // Decision 46: a `plan` row has the key of the plan and no label on a task, so it calls no `ClaimGateway`.
    kind: text('kind').notNull().default('task'),
  },
  (t) => [
    check('run_claims_owner', sql`${t.owner} IN ('run','gate')`),
    check('run_claims_kind', sql`${t.kind} IN ('task','plan')`),
    check('run_claims_gate_owner_has_job', sql`(${t.owner} = 'gate') = (${t.gateJobId} IS NOT NULL)`),
    uniqueIndex('run_claims_one_open_per_task').on(t.loopId, t.taskKey).where(sql`${t.closedAt} IS NULL`),
    index('run_claims_open').on(t.openedAt).where(sql`${t.closedAt} IS NULL`),
  ],
);

/** The merge gate of one repository (spec 2.8, decision 30). No row means off. The gate is off until a person turns it on. */
export const repoGate = pgTable('repo_gate', {
  repoId: uuid('repo_id')
    .primaryKey()
    .references(() => repos.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  githubRepo: text('github_repo').notNull(),
  checkCommand: jsonb('check_command').notNull().default(sql`'[]'::jsonb`),
  updatedAt: ts('updated_at').notNull(),
});

/**
 * Gate jobs (spec 2.8). Two partial unique indexes keep the rules in the database: at most one `running` job, and at most one
 * `queued` or `running` row for each repository, PR and head commit.
 */
export const gateJobs = pgTable(
  'gate_jobs',
  {
    id: uuid('id').primaryKey(),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id),
    prNumber: integer('pr_number').notNull(),
    headSha: text('head_sha').notNull(),
    taskKey: text('task_key').notNull(),
    state: text('state').notNull().default('queued'),
    failedStep: text('failed_step'),
    queuedAt: ts('queued_at').notNull(),
    startedAt: ts('started_at'),
    finishedAt: ts('finished_at'),
    ratifiedAt: ts('ratified_at'),
  },
  (t) => [
    check('gate_jobs_state', sql`${t.state} IN ('queued','running','merged','failed','needs_ratification')`),
    check('gate_jobs_failed_step', sql`${t.failedStep} IS NULL OR ${t.failedStep} IN ('scope','base','setup','green','stub','verify','ci','merge')`),
    uniqueIndex('gate_jobs_one_running').on(t.state).where(sql`${t.state} = 'running'`),
    uniqueIndex('gate_jobs_one_live_per_head').on(t.repoId, t.prNumber, t.headSha).where(sql`${t.state} IN ('queued','running')`),
    index('gate_jobs_queued').on(t.queuedAt, t.id).where(sql`${t.state} = 'queued'`),
  ],
);

/** One step of one gate job; `output_tail` holds the last 60 lines. */
export const gateSteps = pgTable(
  'gate_steps',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => gateJobs.id),
    seq: integer('seq').notNull(),
    step: text('step').notNull(),
    status: text('status').notNull(),
    exitCode: integer('exit_code'),
    ms: integer('ms').notNull(),
    outputTail: text('output_tail').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.seq] }),
    check('gate_steps_step', sql`${t.step} IN ('scope','base','setup','green','stub','verify','ci','merge')`),
    check('gate_steps_status', sql`${t.status} IN ('pass','fail','skip')`),
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

/** The last result of each row of a goal manifest (decision 42), so `loop-goals:` counts every row of the manifest. */
export const goalRuns = pgTable(
  'goal_runs',
  {
    repo: text('repo').notNull(),
    manifest: text('manifest').notNull(),
    rowId: text('row_id').notNull(),
    pass: boolean('pass').notNull(),
    value: doublePrecision('value'),
    of: doublePrecision('of'),
    line: text('line').notNull(),
    cadence: text('cadence').notNull(),
    sha: text('sha').notNull(),
    at: ts('at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.repo, t.manifest, t.rowId] }), check('goal_runs_cadence', sql`${t.cadence} IN ('merge','nightly')`)],
);

/** When the standing goals of a repository ran last and run next. `next_at` is empty when the cron has no later time. */
export const standingSchedule = pgTable('standing_schedule', {
  repo: text('repo').primaryKey(),
  lastAt: ts('last_at').notNull(),
  nextAt: ts('next_at'),
});
