import type { GateFinalState, GateJob, GateStep, GateStepName, RepoGate } from '../../shared/domain/gate';

export type EnqueueGateJobInput = { id: string; repoId: string; prNumber: number; headSha: string; taskKey: string; at: Date };

export type RepoGateInput = { enabled: boolean; githubRepo: string; checkCommand: string[] };

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
  /** Moves a `needs_ratification` job back to `queued`. `false` for any other state. */
  ratify(id: string, at: Date): Promise<boolean>;
  appendStep(step: GateStep): Promise<void>;
  /** By `seq`. */
  listSteps(jobId: string): Promise<GateStep[]>;
  get(id: string): Promise<GateJob | null>;
  /** Newest first. */
  list(limit: number): Promise<GateJob[]>;
}
