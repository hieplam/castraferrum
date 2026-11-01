import { PROBE_STATES, RESTART_POLICIES, type ProbeRecord } from '../../../shared/domain/goal-loop';
import { RUN_STATUSES } from '../../../shared/domain/run';
import { STANDING_GOAL_STATES, type StandingGoalRecord, type StandingIssueRecord, type StandingScheduleRecord } from '../../../shared/domain/standing-goal';
import { GATE_JOB_STATES, GATE_STEPS, GATE_STEP_STATUSES, type GateJob, type GateStep, type RepoGate } from '../../../shared/domain/gate';
import type { ClaimRecord } from '../../ports/claims';
import type { ExecutionRecord } from '../../ports/execution-repository';
import type { HoldRecord } from '../../ports/hold-repository';
import type { LoopRecord } from '../../ports/loop-repository';
import type { NoticeRecord } from '../../ports/notice-repository';
import type { RepoRecord } from '../../ports/repo-repository';
import type { LogLine } from '../../ports/run-log-repository';
import type { RunRecord } from '../../ports/run-repository';

// In-RAM "tables" for the fake repositories (test service). Each table enforces the same constraints Postgres does
// (PRIMARY KEY, FK, UNIQUE, CHECK, partial unique index, trigger — ARCHITECTURE.md § Data) so the memory/ repositories can rely on
// them just as the postgres/ repositories rely on the DB. The tests/contract/ suite runs on both to prove this.
//
// The memory/ repositories have no `await` between read and write, so each operation is atomic (single-threaded JS) — equivalent
// to a transaction. Reads / writes both copy the records so callers cannot mutate the "DB" through a reference.

/** Constraint violation — the same constraint name as Postgres. */
export class ConstraintViolation extends Error {
  readonly constraint: string;
  readonly kind: 'unique' | 'check' | 'foreign_key';

  constructor(kind: 'unique' | 'check' | 'foreign_key', constraint: string) {
    super(`constraint violated: ${constraint}`);
    this.name = 'ConstraintViolation';
    this.kind = kind;
    this.constraint = constraint;
  }
}

export const clone = <T>(v: T): T => structuredClone(v);

/** Byte-wise string comparison — same as Postgres's uuid order for lowercase uuids. */
export const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function restore<K, V>(target: Map<K, V>, from: Map<K, V>): void {
  target.clear();
  for (const [k, v] of from) target.set(k, v);
}

const RUN_STATUS_SET: ReadonlySet<string> = new Set(RUN_STATUSES);

export class MemoryDb {
  readonly repos = new Map<string, RepoRecord>();
  readonly loops = new Map<string, LoopRecord>();
  readonly executions = new Map<string, ExecutionRecord>();
  readonly runs = new Map<string, RunRecord>();
  readonly logs = new Map<string, LogLine[]>();
  readonly probes = new Map<string, ProbeRecord>();
  readonly claims = new Map<string, ClaimRecord>();
  readonly holds = new Map<string, HoldRecord>();
  readonly repoGates = new Map<string, RepoGate>();
  readonly gateJobs = new Map<string, GateJob>();
  /** Keyed by the job id and `seq`. */
  readonly gateSteps = new Map<string, GateStep>();
  heartbeat: Date | null = null;
  readonly notices = new Map<string, NoticeRecord>();
  readonly standingGoals = new Map<string, StandingGoalRecord>();
  readonly standingIssues = new Map<string, StandingIssueRecord>();
  readonly standingSchedules = new Map<string, StandingScheduleRecord>();

  /** Wipe everything (like TRUNCATE in tests). */
  reset(): void {
    this.repos.clear();
    this.loops.clear();
    this.executions.clear();
    this.runs.clear();
    this.logs.clear();
    this.probes.clear();
    this.claims.clear();
    this.holds.clear();
    this.repoGates.clear();
    this.gateJobs.clear();
    this.gateSteps.clear();
    this.heartbeat = null;
    this.notices.clear();
    this.standingGoals.clear();
    this.standingIssues.clear();
    this.standingSchedules.clear();
  }

  /** Run `fn` atomically: an error midway → every table returns to its previous state (ROLLBACK). `fn` must be synchronous. */
  transaction<T>(fn: () => T): T {
    const before = {
      repos: clone(this.repos),
      loops: clone(this.loops),
      executions: clone(this.executions),
      runs: clone(this.runs),
      logs: clone(this.logs),
      probes: clone(this.probes),
      claims: clone(this.claims),
      holds: clone(this.holds),
      repoGates: clone(this.repoGates),
      gateJobs: clone(this.gateJobs),
      gateSteps: clone(this.gateSteps),
      heartbeat: this.heartbeat,
      notices: clone(this.notices),
      standingGoals: clone(this.standingGoals),
      standingIssues: clone(this.standingIssues),
      standingSchedules: clone(this.standingSchedules),
    };
    try {
      return fn();
    } catch (err) {
      restore(this.repos, before.repos);
      restore(this.loops, before.loops);
      restore(this.executions, before.executions);
      restore(this.runs, before.runs);
      restore(this.logs, before.logs);
      restore(this.probes, before.probes);
      restore(this.claims, before.claims);
      restore(this.holds, before.holds);
      restore(this.repoGates, before.repoGates);
      restore(this.gateJobs, before.gateJobs);
      restore(this.gateSteps, before.gateSteps);
      this.heartbeat = before.heartbeat;
      restore(this.notices, before.notices);
      restore(this.standingGoals, before.standingGoals);
      restore(this.standingIssues, before.standingIssues);
      restore(this.standingSchedules, before.standingSchedules);
      throw err;
    }
  }

  // ------------------------------------------------------------------ repos

  insertRepo(row: RepoRecord): void {
    if (this.repos.has(row.id)) throw new ConstraintViolation('unique', 'repos_pkey');
    if ([...row.name].length < 1 || [...row.name].length > 80) throw new ConstraintViolation('check', 'repos_name_length');
    for (const other of this.repos.values()) {
      if (other.name.toLowerCase() === row.name.toLowerCase()) throw new ConstraintViolation('unique', 'repos_name_unique');
      if (other.path === row.path) throw new ConstraintViolation('unique', 'repos_path_unique');
    }
    this.repos.set(row.id, clone(row));
  }

  /** DELETE: a loop (even an archived one) or a gate job still points at it → foreign-key violation, like Postgres. The gate setting goes with the repo (ON DELETE CASCADE). */
  deleteRepo(id: string): void {
    for (const l of this.loops.values()) {
      if (l.repoId === id) throw new ConstraintViolation('foreign_key', 'loops_repo_id_repos_id_fk');
    }
    for (const j of this.gateJobs.values()) {
      if (j.repoId === id) throw new ConstraintViolation('foreign_key', 'gate_jobs_repo_id_repos_id_fk');
    }
    this.repoGates.delete(id);
    this.repos.delete(id);
  }

  // ------------------------------------------------------------------ loops

  /** INSERT or UPDATE one loops row, checking every table constraint before writing. */
  writeLoop(row: LoopRecord): void {
    if (row.name.length < 1 || row.name.length > 80) throw new ConstraintViolation('check', 'loops_name_length');
    if (!this.repos.has(row.repoId)) throw new ConstraintViolation('foreign_key', 'loops_repo_id_repos_id_fk');
    if (row.timeoutSec !== null && (row.timeoutSec < 60 || row.timeoutSec > 86400)) throw new ConstraintViolation('check', 'loops_timeout_range');
    if (!(row.maxConcurrent >= 1 && row.maxConcurrent <= 10)) throw new ConstraintViolation('check', 'loops_max_concurrent_range');
    if (row.archivedAt !== null && row.status !== 'stopped') {
      throw new ConstraintViolation('check', 'loops_archived_is_stopped');
    }
    if (row.status !== 'active' && row.nextRunAt !== null) {
      throw new ConstraintViolation('check', 'loops_next_run_only_active');
    }
    if (row.archivedAt === null) {
      const key = row.name.toLowerCase();
      for (const other of this.loops.values()) {
        if (other.id !== row.id && other.archivedAt === null && other.name.toLowerCase() === key) {
          throw new ConstraintViolation('unique', 'loops_name_live');
        }
      }
    }
    this.loops.set(row.id, clone(row));
  }

  insertLoop(row: LoopRecord): void {
    if (this.loops.has(row.id)) throw new ConstraintViolation('unique', 'loops_pkey');
    this.writeLoop(row);
  }

  // ------------------------------------------------------------------ loop_probes

  /** INSERT or UPDATE one loop_probes row, checking every table constraint before writing. */
  writeProbe(row: ProbeRecord): void {
    if (!this.loops.has(row.loopId)) throw new ConstraintViolation('foreign_key', 'loop_probes_loop_id_loops_id_fk');
    if (!(RESTART_POLICIES as readonly string[]).includes(row.restartPolicy)) throw new ConstraintViolation('check', 'loop_probes_restart_policy');
    if (!(PROBE_STATES as readonly string[]).includes(row.state)) throw new ConstraintViolation('check', 'loop_probes_state');
    this.probes.set(row.loopId, clone(row));
  }

  // ------------------------------------------------------------------ run_claims

  /** INSERT or UPDATE: the partial unique index run_claims_one_open_per_task allows one open row for each loop and task key. */
  /** The partial unique index: one open hold for each resource. */
  writeHold(row: HoldRecord): void {
    if (row.closedAt === null) {
      for (const other of this.holds.values()) {
        if (other.id !== row.id && other.closedAt === null && other.resource === row.resource) throw new ConstraintViolation('unique', 'resource_holds_one_open');
      }
    }
    this.holds.set(row.id, clone(row));
  }

  writeClaim(row: ClaimRecord): void {
    if (!this.loops.has(row.loopId)) throw new ConstraintViolation('foreign_key', 'run_claims_loop_id_loops_id_fk');
    if (row.owner !== 'run' && row.owner !== 'gate') throw new ConstraintViolation('check', 'run_claims_owner');
    if (row.kind !== 'task' && row.kind !== 'plan') throw new ConstraintViolation('check', 'run_claims_kind');
    if ((row.owner === 'gate') !== (row.gateJobId !== null)) throw new ConstraintViolation('check', 'run_claims_gate_owner_has_job');
    if (row.gateJobId !== null && !this.gateJobs.has(row.gateJobId)) throw new ConstraintViolation('foreign_key', 'run_claims_gate_job_id_gate_jobs_id_fk');
    if (row.closedAt === null) {
      for (const other of this.claims.values()) {
        if (other.id !== row.id && other.closedAt === null && other.loopId === row.loopId && other.taskKey === row.taskKey) {
          throw new ConstraintViolation('unique', 'run_claims_one_open_per_task');
        }
      }
    }
    this.claims.set(row.id, clone(row));
  }

  // ------------------------------------------------------------------ repo_gate, gate_jobs, gate_steps

  /** INSERT or UPDATE one repo_gate row. */
  writeRepoGate(row: RepoGate): void {
    if (!this.repos.has(row.repoId)) throw new ConstraintViolation('foreign_key', 'repo_gate_repo_id_repos_id_fk');
    this.repoGates.set(row.repoId, clone(row));
  }

  /** INSERT or UPDATE one gate_jobs row. The partial unique indexes gate_jobs_one_running and gate_jobs_one_live_per_head live here. */
  writeGateJob(row: GateJob): void {
    if (!this.repos.has(row.repoId)) throw new ConstraintViolation('foreign_key', 'gate_jobs_repo_id_repos_id_fk');
    if (!(GATE_JOB_STATES as readonly string[]).includes(row.state)) throw new ConstraintViolation('check', 'gate_jobs_state');
    if (row.failedStep !== null && !(GATE_STEPS as readonly string[]).includes(row.failedStep)) throw new ConstraintViolation('check', 'gate_jobs_failed_step');
    const live = (state: string) => state === 'queued' || state === 'running';
    for (const other of this.gateJobs.values()) {
      if (other.id === row.id) continue;
      if (row.state === 'running' && other.state === 'running') throw new ConstraintViolation('unique', 'gate_jobs_one_running');
      if (live(row.state) && live(other.state) && other.repoId === row.repoId && other.prNumber === row.prNumber && other.headSha === row.headSha) {
        throw new ConstraintViolation('unique', 'gate_jobs_one_live_per_head');
      }
    }
    this.gateJobs.set(row.id, clone(row));
  }

  /** INSERT one gate_steps row: the primary key is the job and `seq`. */
  insertGateStep(row: GateStep): void {
    if (!this.gateJobs.has(row.jobId)) throw new ConstraintViolation('foreign_key', 'gate_steps_job_id_gate_jobs_id_fk');
    if (!(GATE_STEPS as readonly string[]).includes(row.step)) throw new ConstraintViolation('check', 'gate_steps_step');
    if (!(GATE_STEP_STATUSES as readonly string[]).includes(row.status)) throw new ConstraintViolation('check', 'gate_steps_status');
    const key = `${row.jobId}\n${row.seq}`;
    if (this.gateSteps.has(key)) throw new ConstraintViolation('unique', 'gate_steps_job_id_seq_pk');
    this.gateSteps.set(key, clone(row));
  }

  // ------------------------------------------------------------------ loop_executions

  writeExecution(row: ExecutionRecord, isInsert: boolean): void {
    if (isInsert && this.executions.has(row.id)) throw new ConstraintViolation('unique', 'loop_executions_pkey');
    if (!this.loops.has(row.loopId)) throw new ConstraintViolation('foreign_key', 'loop_executions_loop_id_loops_id_fk');
    if ((row.endedAt === null) !== (row.endReason === null)) {
      throw new ConstraintViolation('check', 'executions_ended_has_reason');
    }
    for (const other of this.executions.values()) {
      if (other.id === row.id || other.loopId !== row.loopId) continue;
      if (other.seq === row.seq) throw new ConstraintViolation('unique', 'executions_loop_seq');
      if (other.endedAt === null && row.endedAt === null) {
        throw new ConstraintViolation('unique', 'executions_one_open_per_loop');
      }
    }
    this.executions.set(row.id, clone(row));
  }

  // ------------------------------------------------------------------ runs

  writeRun(row: RunRecord, isInsert: boolean): void {
    if (isInsert && this.runs.has(row.id)) throw new ConstraintViolation('unique', 'runs_pkey');
    if (!this.loops.has(row.loopId)) throw new ConstraintViolation('foreign_key', 'runs_loop_id_loops_id_fk');
    if (!this.executions.has(row.executionId)) {
      throw new ConstraintViolation('foreign_key', 'runs_execution_id_loop_executions_id_fk');
    }
    if (!RUN_STATUS_SET.has(row.status)) throw new ConstraintViolation('check', 'runs_status');
    let running = 0;
    for (const other of this.runs.values()) {
      if (other.id === row.id || other.loopId !== row.loopId) continue;
      if (row.iteration !== null && other.iteration === row.iteration) {
        throw new ConstraintViolation('unique', 'runs_loop_iteration');
      }
      if (other.status === 'running') running++;
    }
    // Trigger runs_max_concurrent_per_loop: INSERTing a running run when the loop already has max_concurrent running runs → reject.
    // Only on insert, like BEFORE INSERT: lowering max_concurrent does not touch runs already running.
    if (isInsert && row.status === 'running' && running >= (this.loops.get(row.loopId)?.maxConcurrent ?? 1)) {
      throw new ConstraintViolation('check', 'runs_max_concurrent_per_loop');
    }
    this.runs.set(row.id, clone(row));
  }

  // ------------------------------------------------------------------ standing goals

  /** INSERT or UPDATE one standing_goals row. */
  writeStandingGoal(row: StandingGoalRecord): void {
    if (!(STANDING_GOAL_STATES as readonly string[]).includes(row.state)) throw new ConstraintViolation('check', 'standing_goals_state');
    this.standingGoals.set(`${row.repo}\n${row.rowId}`, clone(row));
  }

  /** INSERT: the partial unique index standing_issues_one_open_per_fingerprint allows one open row for each repo and fingerprint. */
  insertStandingIssue(row: StandingIssueRecord): void {
    if (this.standingIssues.has(row.id)) throw new ConstraintViolation('unique', 'standing_issues_pkey');
    for (const other of this.standingIssues.values()) {
      if (other.closedAt === null && other.repo === row.repo && other.fingerprint === row.fingerprint) {
        throw new ConstraintViolation('unique', 'standing_issues_one_open_per_fingerprint');
      }
    }
    this.standingIssues.set(row.id, clone(row));
  }

  // ------------------------------------------------------------------ notices

  /** INSERT: the partial unique index notices_one_unread_per_key allows one unread row for each `dedupeKey`. */
  insertNotice(row: NoticeRecord): void {
    if (this.notices.has(row.id)) throw new ConstraintViolation('unique', 'notices_pkey');
    if (row.readAt === null) {
      for (const other of this.notices.values()) {
        if (other.readAt === null && other.dedupeKey === row.dedupeKey) throw new ConstraintViolation('unique', 'notices_one_unread_per_key');
      }
    }
    this.notices.set(row.id, clone(row));
  }
}
