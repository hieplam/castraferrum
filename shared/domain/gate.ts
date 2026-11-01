// The merge gate (spec 2.8): one job at a time, a record of each step.

/** The steps of a job, in the order that they run. */
export const GATE_STEPS = ['scope', 'base', 'setup', 'green', 'stub', 'verify', 'ci', 'merge'] as const;
export type GateStepName = (typeof GATE_STEPS)[number];

export const GATE_JOB_STATES = ['queued', 'running', 'merged', 'failed', 'needs_ratification'] as const;
export type GateJobState = (typeof GATE_JOB_STATES)[number];

/** The states that a running job can end in. */
export type GateFinalState = Exclude<GateJobState, 'queued' | 'running'>;

export const GATE_STEP_STATUSES = ['pass', 'fail', 'skip'] as const;
export type GateStepStatus = (typeof GATE_STEP_STATUSES)[number];

/** The gate setting of one repository. The gate is off until a person turns it on (decision 30). */
export type RepoGate = {
  repoId: string;
  enabled: boolean;
  /** `owner/name` on GitHub. */
  githubRepo: string;
  /** The argv of the command that runs after a merge (spec 2.8). */
  checkCommand: string[];
  updatedAt: Date;
};

export type GateJob = {
  id: string;
  repoId: string;
  prNumber: number;
  headSha: string;
  taskKey: string;
  state: GateJobState;
  failedStep: GateStepName | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  ratifiedAt: Date | null;
};

/** One step of one job. `seq` counts from 1 inside the job. `outputTail` holds the last 60 lines. */
export type GateStep = {
  jobId: string;
  seq: number;
  step: GateStepName;
  status: GateStepStatus;
  exitCode: number | null;
  ms: number;
  outputTail: string;
};
