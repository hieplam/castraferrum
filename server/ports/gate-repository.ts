import type { GateFinalState, GateJob, GateStep, GateStepName, RepoGate } from '../../shared/domain/gate';

export type EnqueueGateJobInput = { id: string; repoId: string; prNumber: number; headSha: string; taskKey: string; at: Date };

export type RepoGateInput = { enabled: boolean; githubRepo: string; checkCommand: string[] };

export type GateRatifyOutcome = 'ratified' | 'not_ratifiable' | 'duplicate';

export interface GateRepository {
  /** `null` when nobody set the gate of the repository: it is off. */
  getRepoGate(repoId: string): Promise<RepoGate | null>;
  /** Replaces the whole setting. Throws `REPO_NOT_FOUND`. */
  setRepoGate(repoId: string, input: RepoGateInput, at: Date): Promise<RepoGate>;
  /** `duplicate`: the same repository, PR and head commit is already `queued` or `running`. */
  enqueue(input: EnqueueGateJobInput): Promise<'queued' | 'duplicate'>;
  /** Moves the oldest `queued` job to `running`. `null` when none is queued, or while one job runs. */
  takeNext(at: Date): Promise<GateJob | null>;
  /** Only a `running` job ends. `null` when the job is not running: the first `finish` stays. */
  finish(id: string, input: { state: GateFinalState; failedStep: GateStepName | null; at: Date }): Promise<GateJob | null>;
  /**
   * Moves a `needs_ratification` job back to `queued`. `not_ratifiable`: any other state, or an unknown job.
   * `duplicate`: another job of the same repository, PR and head commit is `queued` or `running`, and nothing changes.
   */
  ratify(id: string, at: Date): Promise<GateRatifyOutcome>;
  /** Decision 37: at start-up, moves each `running` job to `queued`. Gives the number of jobs moved. */
  requeueRunning(at: Date): Promise<number>;
  appendStep(step: GateStep): Promise<void>;
  /** By `seq`. */
  listSteps(jobId: string): Promise<GateStep[]>;
  get(id: string): Promise<GateJob | null>;
  /** Jobs in state `failed` or `needs_ratification` with `from <= finished_at < to`, ordered by `finished_at`, then `id`. */
  listRefusedBetween(from: Date, to: Date): Promise<GateJob[]>;
  /** Newest first. */
  list(limit: number): Promise<GateJob[]>;
}
