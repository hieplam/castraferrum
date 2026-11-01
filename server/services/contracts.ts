// Service interfaces that the entry layer (server/http, server/scheduler) calls. The entry layer imports only this file,
// never the Default… classes — the rule lives in .dependency-cruiser.cjs.
// Dependencies inside the service layer are one-way too: LoopService → RunService, SchedulingService → RunService, HoldService → RunService; RunService calls
// no other service (ARCHITECTURE.md § Layers). The Default… classes only know each other through the interfaces here.
import type { GoalCardRecord } from '../ports/goal-card-repository';
import type { DomainEvent, EventFilter } from '../../shared/domain/events';
import type { ProbeRecord, ProbeResource, RestartPolicy } from '../../shared/domain/goal-loop';
import type { ExecutionEndReason, ExecutionStats, LogLine, LoopStatus, RunStatus } from '../../shared/domain/run';
import type { TranscriptEntry, TranscriptPage } from '../../shared/domain/transcript';
import type { ExecutorDescriptor } from '../ports/executor';
import type { FolderEntry, FolderListing, FolderPlaces } from '../ports/folders';
import type { LoopFilter } from '../ports/loop-repository';
import type { NoticeRecord } from '../ports/notice-repository';
import type { Page, PageRequest } from '../ports/page';
import type { RunRecord } from '../ports/run-repository';

export type { DomainEvent, EventFilter } from '../../shared/domain/events';
export type { ExecutionStats, LogLine } from '../../shared/domain/run';
export type { TranscriptEntry, TranscriptPage } from '../../shared/domain/transcript';
export type { ExecutorDescriptor } from '../ports/executor';
export type { LoopFilter } from '../ports/loop-repository';
export type { Page, PageRequest } from '../ports/page';

export type HealthReport = { ok: boolean; db: 'up' | 'down' };

/** One row of `goals/health.json`, with its command as an argv array. */
export type StandingRow = { id: string; outcome: string; run: string[]; timeoutSec: number; verbatim?: boolean };

export type HealthInput = { repo: string; cwd: string; text: string; now: Date; platform?: string };

export type StandingPassInput = { repo: string; cwd: string; rows: StandingRow[]; maxNewIssues?: number; now: Date };

/** Numbers of issues (`opened`, `updated`, `closed`), and of failing rows that wait for the next pass (`deferred`). */
export type StandingPassResult = { opened: number; updated: number; closed: number; deferred: number };

export interface StandingGoalService {
  runPass(input: StandingPassInput): Promise<StandingPassResult>;
  /** True with no schedule, or when the next time has come. */
  isDue(repo: string, now: Date): Promise<boolean>;
  markRan(repo: string, cron: string, timezone: string, now: Date): Promise<void>;
  /** Parses `goals/health.json`, runs its rows when the schedule is due, then marks the pass. `null` when it is not due. */
  runHealth(input: HealthInput): Promise<StandingPassResult | null>;
}

export interface HealthService {
  check(): Promise<HealthReport>;
}

// ---------------------------------------------------------------- data types

/** Data the user submits when creating / editing (SPEC § Model). Omitted fields take defaults. */
export type LoopInput = {
  name: string;
  description?: string;
  prompt: string;
  /** Required, must be a registered repo — every run executes with `cwd` = the repo `path`. */
  repoId?: string;
  cron: string;
  /** IANA time zone; defaults to `Asia/Ho_Chi_Minh`. */
  timezone?: string;
  /** 60–86 400; omitted / `null` = unlimited (SPEC-phase-2). */
  timeoutSec?: number | null;
  /** Maximum parallel runs 1–10; omitted / `null` = 1. */
  maxConcurrent?: number | null;
  /** Defaults to `{ kind: 'mock' }`; missing `config` fields take the executor schema defaults. */
  executor?: { kind: string; config?: unknown };
};

/** Error on one form field — `details.issues` of `VALIDATION_FAILED`. The UI translates by `code`. */
export type ValidationIssue = {
  field:
    | 'tz'
    | 'name'
    | 'description'
    | 'prompt'
    | 'repoId'
    | 'path'
    | 'cron'
    | 'timezone'
    | 'timeoutSec'
    | 'maxConcurrent'
    | 'command'
    | 'claim'
    | 'release'
    | 'resources'
    | 'laneEnv'
    | 'laneBasePort'
    | 'executor.kind'
    | `executor.config${string}`;
  code:
    | 'required'
    | 'tooLong'
    | 'outOfRange'
    | 'invalid'
    | 'unknownExecutor'
    | 'unknownRepo'
    | 'notDirectory'
    | 'missingKey'
    | 'missingReason'
    | 'missingBasePort'
    | 'reserved';
  message: string;
};

/** A registered repo (UC-19). */
export type RepoView = { id: string; name: string; path: string; createdAt: Date };

/** Repo list row (D-UI11): whether the folder still exists (checked at read time) + number of loops using it (archived included). */
export type RepoListView = RepoView & { exists: boolean; loopCount: number };

/** Register a repo: the absolute path of an existing folder; empty name = the folder name. */
export type RepoInput = { path: string; name?: string };

/** One folder for the "Browse…" box: the FolderBrowser listing + the name of the repo registered at exactly that folder (if any). */
export type FolderView = Omit<FolderListing, 'kind' | 'entries'> & {
  repo: string | null;
  entries: (FolderEntry & { repo: string | null })[];
};

/** The "Quick access" column: familiar folders + drives + folders containing registered repos. */
export type FolderPlacesView = FolderPlaces & { nearRepos: { path: string; name: string; repos: string[] }[] };

/** One run — exactly the stored record (prompt + executor snapshot, session id, timestamps…). */
export type RunView = RunRecord;

/** One execution (Start → Stop) with its stats. */
export type ExecutionView = {
  id: string;
  loopId: string;
  /** Execution #k. */
  seq: number;
  startedAt: Date;
  endedAt: Date | null;
  endReason: ExecutionEndReason | null;
  stats: ExecutionStats;
};

/** Execution detail (UC-08): every run (oldest first) + the session ids in run order. */
export type ExecutionDetail = ExecutionView & { runs: RunView[]; sessionIds: string[] };

/** A loop as the list needs it (UC-03): config + status + current / latest execution + active / latest run. */
export type LoopView = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  /** The loop's repo (its name shows in the list / detail — UC-25). */
  repo: RepoView;
  cron: string;
  timezone: string;
  /** `null` = unlimited. */
  timeoutSec: number | null;
  /** Maximum parallel runs. */
  maxConcurrent: number;
  executor: { kind: string; config: unknown };
  status: LoopStatus;
  /** `null` when stopped, and always for a loop with a probe. */
  nextRunAt: Date | null;
  /** Optimistic lock — send it back when editing (UC-09). */
  version: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  /** Total rounds over the loop's lifetime (the largest #N). */
  iterations: number;
  /** Number of executions (the largest #k). */
  executionCount: number;
  /** The open execution; for a stopped loop the latest one; never started → null. */
  currentExecution: ExecutionView | null;
  /** The NEWEST running run (= `activeRuns[0]`); none → null. */
  activeRun: RunView | null;
  /** Every running run, newest first (at most `maxConcurrent`, or more right after N is lowered). */
  activeRuns: RunView[];
  /** The latest run that has a result (running and skipped runs do not count). */
  lastRun: RunView | null;
};

/** Loop detail (UC-06): adds the longest execution + the total run count (the denominator for paging the run history). */
export type LoopDetail = LoopView & {
  longestExecution: { executionId: string; seq: number; elapsedMs: number } | null;
  /** Total runs over the loop's lifetime, skipped runs included (`iterations` does not count skipped runs). */
  runCount: number;
};

/** The overview bar + loop counts per list tab (UC-03, `GET /api/stats`). */
export type OverviewView = {
  /** Active loops (not archived). */
  activeLoops: number;
  /** Runs currently running across all loops. */
  runningRuns: number;
  /** Runs that started (skipped excluded) since 00:00 today in the `timezone` time zone. */
  runsToday: number;
  /** Error runs (failed + timed_out + interrupted) that ended in the last 24 hours. */
  errors24h: number;
  /** Loops per tab: All (not archived) / Running / Stopped / Archived. */
  loops: { all: number; active: number; stopped: number; archived: number };
  timezone: string;
  /** 00:00 today (the anchor of `runsToday`) + the server's current time. */
  todayFrom: Date;
  now: Date;
};

/** Result of one scheduler tick. */
export type TickReport = {
  at: Date;
  /** `false` = the previous tick has not finished, so this tick is dropped (does nothing). */
  ran: boolean;
  /** Whether a heartbeat was written on this tick (every 10 seconds). */
  heartbeat: boolean;
  /** Number of overdue runs cancelled (`timed_out`). */
  timedOut: number;
  /** Runs newly started by the schedule. */
  started: string[];
  /** Runs skipped because the previous run is still going. */
  skipped: string[];
  /** Loops that were due but could not run (unexpected error) — other loops keep running. */
  errors: { loopId: string; message: string }[];
};

export type RecoveryReport = {
  at: Date;
  /** Last heartbeat of the previous server run (= endedAt of the execution closed as `server_down`); never had one → null. */
  lastHeartbeatAt: Date | null;
  interruptedRuns: number;
  closedExecutions: number;
  stoppedLoops: number;
};

// ---------------------------------------------------------------- services

export interface LoopService {
  /** Includes the current execution stats, the running run and the next run. */
  list(filter: LoopFilter): Promise<LoopView[]>;
  /** Throws LOOP_NOT_FOUND. */
  get(id: string): Promise<LoopDetail>;
  /** Always `stopped`. Throws VALIDATION_FAILED (`details.issues`) / LOOP_NAME_TAKEN. */
  create(input: LoopInput): Promise<LoopView>;
  /** Changing the schedule while running → recompute the next run; changing prompt / executor → applies from the next run. Throws VERSION_CONFLICT. */
  update(id: string, input: LoopInput, version: number): Promise<LoopView>;
  /** Opens a new execution + its first run starts immediately (a loop with a probe: no run, no next run). Throws LOOP_ALREADY_ACTIVE, LOOP_ARCHIVED. */
  start(id: string): Promise<LoopView>;
  /** Closes the execution as `stopped` + cancels the running and held runs. Throws LOOP_NOT_ACTIVE. */
  stop(id: string): Promise<LoopView>;
  /**
   * Decision 46: the probe said `done`. Closes the execution as `goal_met` and publishes `execution.ended` and `loop.updated`. It cancels nothing, so the caller
   * checks that no run is live. A loop with no open execution changes nothing.
   */
  finishGoal(id: string): Promise<void>;
  /** A copy named "… (copy)" in the Stopped state, carrying no executions / runs. */
  duplicate(id: string): Promise<LoopView>;
  /** Throws LOOP_IS_ACTIVE. */
  archive(id: string): Promise<void>;
  /** Back to Stopped. Throws LOOP_NAME_TAKEN when a live loop with the same name exists. */
  restore(id: string): Promise<LoopView>;
  /** Newest first. Throws LOOP_NOT_FOUND. */
  listExecutions(loopId: string, page: PageRequest): Promise<Page<ExecutionView>>;
  /** Throws EXECUTION_NOT_FOUND. */
  getExecution(executionId: string): Promise<ExecutionDetail>;
  /** The overview bar (UC-03). Bad time zone → VALIDATION_FAILED on field `tz`. */
  overview(timezone: string, repoId?: string): Promise<OverviewView>;
  /** Available executors + their config schema (`GET /api/executors`). */
  executors(): ExecutorDescriptor[];
}

export interface RepoService {
  /** By name; each repo carries a folder-exists flag + the number of loops using it. */
  list(): Promise<RepoListView[]>;
  /** UC-19. Throws VALIDATION_FAILED (`path`: required / invalid / notDirectory; `name`: tooLong), REPO_PATH_TAKEN, REPO_NAME_TAKEN. */
  register(input: RepoInput): Promise<RepoView>;
  /** UC-20. Throws REPO_NOT_FOUND, REPO_IN_USE (`details.loops`). */
  remove(id: string): Promise<void>;
}

export interface NoticeService {
  /** Unread notices, newest first, at most 100. */
  listUnread(): Promise<NoticeRecord[]>;
  /** Throws NOTICE_NOT_FOUND. */
  markRead(id: string): Promise<void>;
}

/** One run as the process review reads it (spec 2.12): no loop name, prompt or path. */
export type ProcessEvent = { id: string; at: Date; loop: string; status: RunStatus; text: string };

/** A refused gate job (`kind` `gate`) or a `loop-release:` comment (`kind` `comment`), as the process review reads it (decision 48). */
export type ProcessSignal = { id: string; at: Date; kind: 'gate' | 'comment'; text: string };

export interface ProcessService {
  /** Runs that started in [from, to), oldest first. Throws VALIDATION_FAILED when from >= to or the range is over 31 days. */
  events(from: Date, to: Date): Promise<ProcessEvent[]>;
  /**
   * Gate jobs that ended `failed` or `needs_ratification` in [from, to), and the `loop-release:` comments of `repo` made in [from, to).
   * Throws VALIDATION_FAILED as `events` does, and GIT_HOST_FAILED when the Git host call fails: never two empty lists.
   */
  signals(from: Date, to: Date, repo: string): Promise<{ gate: ProcessSignal[]; comments: ProcessSignal[] }>;
}

/** One cause of the scoreboard: the repeats of a fingerprint around the date its check was merged. */
export type ScoreboardCause = {
  fingerprint: string;
  cause: string;
  checkName: string | null;
  checkMergedAt: Date | null;
  before: number;
  after: number;
  repeats: number;
};

export type Scoreboard = {
  figures: { causes: number; checks: number; before: number; after: number };
  weeks: { from: Date; repeats: number }[];
  causes: ScoreboardCause[];
};

export interface ScoreboardService {
  /** Reads the process review reports of every registered repository (spec 2.12). Throws VALIDATION_FAILED on field `tz` for a bad time zone. */
  scoreboard(tz: string): Promise<Scoreboard>;
}

export interface FolderService {
  /**
   * UC-29: one folder + its subfolders; a folder registered as a repo carries the repo name. Empty = home folder; accepts `~`. Throws
   * VALIDATION_FAILED on field `path`: `invalid` (not absolute) · `notDirectory` (does not exist / is a file).
   */
  browse(path?: string): Promise<FolderView>;
  /** Quick access for the "Browse…" box + the machine's operating system (so the path field can suggest the right style). */
  places(): Promise<FolderPlacesView>;
}

/**
 * What a probe tick gives to a claimed run (spec 2.7). `slot` is stored on the run. `env` is not stored: a resume computes it again from `runs.slot`
 * (decision 24). `action` is the word of the probe line, and it goes to the first line of the prompt. `failing` (a `plan` run) adds the line `Failing goal rows: ...` (decision 46).
 */
export type ClaimedStart = { runId: string; taskKey: string; slot: number; env: Record<string, string>; action: 'take' | 'plan'; failing?: string[]; gateGuard?: boolean };

export interface RunService {
  /** The first run at Start (trigger `start`). Returns immediately, does not wait for the run to finish. */
  startFirst(loopId: string, executionId: string): Promise<RunView>;
  /** A scheduled run; if the loop already has a running run → returns a `skipped` run. */
  startScheduled(loopId: string, executionId: string, scheduledFor: Date): Promise<RunView>;
  /** A run for a claimed task (trigger `probe`), with the id that the claim row holds. Full lanes give a `skipped` run with that id. */
  startClaimed(loopId: string, executionId: string, claim: ClaimedStart): Promise<RunView>;
  /** Cancel a running or held run: the DB changes at once, the executor receives the signal. A finished run → returned unchanged. Throws RUN_NOT_FOUND. */
  cancel(runId: string, reason: 'cancelled' | 'timed_out'): Promise<RunView>;
  /**
   * The same session goes on with `RESUME_LINE` (spec 2.5, 2.7): the run is `running` again with a new deadline, and this returns at once. A run that is not
   * `held` → returned unchanged. Throws RUN_NOT_FOUND, or on a broken dependency: the run then stays `held`, so a later tick tries it again.
   */
  resumeHeld(runId: string, input: { env: Record<string, string>; gateGuard?: boolean }): Promise<RunView>;
  /** Runs past their deadline → cancelled with reason `timed_out`. Returns the count. */
  expireOverdue(): Promise<number>;
  /** Throws RUN_NOT_FOUND. */
  get(runId: string): Promise<RunView>;
  /** Newest first. Throws LOOP_NOT_FOUND. */
  listByLoop(loopId: string, page: PageRequest): Promise<Page<RunView>>;
  /** Stored log lines with seq > afterSeq, ascending. Throws RUN_NOT_FOUND. */
  logs(runId: string, afterSeq: number): Promise<LogLine[]>;
}

export interface SchedulingService {
  /** The scheduler layer calls this every second: heartbeat (10 s), overdue runs, due loops. */
  tick(): Promise<TickReport>;
}

export interface RecoveryService {
  /** main.ts calls this once at startup, before the ticker and HTTP. */
  recover(): Promise<RecoveryReport>;
}

export interface LiveService {
  /** State events (by default every type except `run.log`) until the signal aborts. */
  events(filter: EventFilter, signal: AbortSignal): AsyncIterable<DomainEvent>;
  /** Replays stored log lines after `afterSeq` then keeps following; run finishes (or signal aborts) → the iterable ends. */
  runLogs(runId: string, afterSeq: number, signal: AbortSignal): AsyncIterable<LogLine>;
}

/** One event of the transcript stream (SPEC-phase-2 § Transcript — Service + API). */
export type TranscriptEvent =
  /** The last page when the stream opens (only when not resuming). */
  | ({ type: 'snapshot' } & TranscriptPage)
  /** New entries appended to the file; `end` = the byte after the last entry (= the SSE `id`). */
  | { type: 'entries'; entries: TranscriptEntry[]; end: number }
  /** File not there yet / not found: for a running run, retry every 500 ms; for a finished run `ended` follows right after. */
  | { type: 'missing' }
  /** The run finished (file drained one last time) — the stream closes right after. */
  | { type: 'ended'; status: RunStatus };

export interface TranscriptService {
  /** One page (oldest first); `before` null = the last page. Throws RUN_NOT_FOUND, TRANSCRIPT_NOT_FOUND (no session / no file). */
  page(runId: string, before: number | null): Promise<TranscriptPage>;
  /**
   * Follows the run's transcript until the run ends (`ended`) or the signal aborts. `after` null → `snapshot` first;
   * non-null (resume) → only entries from `after`. Each call is its own stream, no locking. Throws RUN_NOT_FOUND.
   */
  follow(runId: string, after: number | null, signal: AbortSignal): AsyncIterable<TranscriptEvent>;
}

// ---------------------------------------------------------------- probe settings

/** Data the user submits for a loop's probe. An omitted field takes its default. */
export type ProbeInput = {
  command: string[];
  claim?: string[];
  release?: string[];
  resources?: ProbeResource[];
  laneEnv?: Record<string, string>;
  laneBasePort?: number | null;
  restartPolicy?: RestartPolicy;
};

/** The stored probe of a loop. */
export type ProbeView = ProbeRecord;

/** Result of one probe tick. */
export type ProbeTickReport = {
  at: Date;
  /** `false` = the previous tick has not finished, so this tick is dropped (does nothing). */
  ran: boolean;
  /** Loops whose probe was called on this tick. */
  probed: string[];
  /** The loops of `probed` that gave `probe_failed`. */
  failed: string[];
  /** Loops that hit an unexpected error. Other loops keep running. */
  errors: { loopId: string; message: string }[];
};

/** What the background ticker needs from a service. */
export interface BackgroundService {
  tick(): Promise<{ errors: { loopId: string; message: string }[] }>;
}

export type GoalMergeInput = {
  /** `owner/name`. */
  repo: string;
  repoPath: string;
  /** The gate job. The worktree of the pass takes its name from this id. */
  jobId: string;
  signal?: AbortSignal;
};

/** A goal pass does not throw for a failed manifest: each failure is one line here. */
export type GoalPassReport = { errors: string[] };

/** The goal number of an epic (spec 2.10, decision 42). */
export interface GoalService {
  /** Runs the `merge` rows of each open epic on the new `main`, then comments `loop-goals:`. */
  afterMerge(input: GoalMergeInput): Promise<GoalPassReport>;
  /** Runs the `nightly` rows that last ran more than 24 h ago. */
  nightly(now: Date, signal?: AbortSignal): Promise<GoalPassReport>;
}

export type GateQueueInput = { repoId: string; prNumber: number; taskKey?: string };
/** `jobId` is `null` only when a duplicate job ended before the read. */
export type GateQueueResult = { outcome: 'queued' | 'duplicate'; jobId: string | null; headSha: string; taskKey: string };
/** `errors[].loopId` holds the id of the gate job. */
export type GateTickReport = { jobId: string | null; errors: { loopId: string; message: string }[] };
export type GateRatified = { jobId: string; state: 'queued'; headSha: string };

export interface GateService extends BackgroundService {
  /** Runs at most one job of the queue to its end. */
  tick(): Promise<GateTickReport>;
  /** Throws REPO_NOT_FOUND, GATE_OFF (the gate of the repository is off). */
  queue(input: GateQueueInput): Promise<GateQueueResult>;
  /** Decision 41: the job takes the queue again and skips only `checkScope`. Throws GATE_JOB_NOT_FOUND, GATE_JOB_NOT_RATIFIABLE (wrong state, or a live job of the same head). */
  ratify(id: string): Promise<GateRatified>;
  /** Decision 37: aborts the running command and waits. The job stays `running`, and `tick` takes nothing. */
  stop(): Promise<void>;
  /** After `stop`, lets `tick` take jobs again. The reset of test mode uses it. */
  resume(): void;
}

export type GoalCardList = {
  /** Newest first. */
  items: GoalCardRecord[];
  /** The count of `items` that are accepted or started with `changed` false. */
  acceptedWithNoChange: number;
};
/** `errors[].loopId` holds the id of the repository. */
export type GoalCardTickReport = { errors: { loopId: string; message: string }[] };

/** Turns an accepted card into a running goal. A throw keeps the card `accepted`, and the service calls `start` again. */
export interface GoalCardStarter {
  start(card: GoalCardRecord): Promise<void>;
}

export interface GoalCardService extends BackgroundService {
  /** Serves each repository with a `repo_gate` row and a charter on `main`, at most once in 60 s. */
  tick(): Promise<GoalCardTickReport>;
  /** `null` lists the cards of every repository. */
  list(repoId: string | null): Promise<GoalCardList>;
  /** The one-word yes. Throws GOAL_CARD_NOT_FOUND, GOAL_CARD_NOT_OPEN, GIT_HOST_FAILED. */
  accept(id: string): Promise<GoalCardRecord>;
  /** The no. It closes the issue. Throws GOAL_CARD_NOT_FOUND, GOAL_CARD_NOT_OPEN, GIT_HOST_FAILED. */
  refuse(id: string): Promise<GoalCardRecord>;
}

/** Result of one hold tick. An error names the loop of the run, or the hold id for a hold. */
export type HoldTickReport = {
  at: Date;
  /** `false` = the previous tick has not finished, so this tick is dropped (does nothing). */
  ran: boolean;
  errors: { loopId: string; message: string }[];
};

/** An open hold as the API shows it: `openedByRun` is `null` for a hold that a probe line opened. */
export type OpenHoldView = {
  id: string;
  resource: string;
  reason: string;
  openedAt: Date;
  until: Date | null;
  openedByRun: { id: string; iteration: number | null } | null;
};

export interface HoldService extends BackgroundService {
  /** The open holds, oldest first, each with the iteration of the run that opened it. */
  listOpen(): Promise<OpenHoldView[]>;
  /** Closes the holds that ended (decision 44), starts a trial when the end is not known, and resumes the held runs when no `plan-window` hold is open. */
  tick(): Promise<HoldTickReport>;
}

export interface ProbeService extends BackgroundService {
  /** Releases orphaned claims, then calls each due probe (decision 22), stores its line, and starts the tasks of a `take` (decision 23). */
  tick(): Promise<ProbeTickReport>;
  /** A loop with no probe gives `null`. Throws LOOP_NOT_FOUND. */
  get(loopId: string): Promise<ProbeView | null>;
  /**
   * Stores the settings (insert or replace). Throws LOOP_NOT_FOUND, LOOP_ARCHIVED, LOOP_IS_ACTIVE (stop the loop first),
   * VALIDATION_FAILED (`details.issues`: `command:required`, `claim:missingKey`, `release:missingKey`, `release:missingReason`,
   * `resources:reserved`, `laneEnv:missingBasePort`, and range errors).
   */
  save(loopId: string, input: ProbeInput): Promise<ProbeView>;
  /** Deletes the probe; a loop with no probe is not an error. Throws LOOP_NOT_FOUND, LOOP_ARCHIVED, LOOP_IS_ACTIVE. */
  remove(loopId: string): Promise<void>;
}
