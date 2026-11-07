// Request / response of the gate queue (`POST /api/gate/jobs`, `POST /api/gate/jobs/:id/ratify`, spec 2.8) and of the gate pages
// (`GET` and `PUT /api/repos/:id/gate`, `GET /api/gate/jobs/:id`, task K12).
import { z } from 'zod';
import { GATE_JOB_STATES, GATE_STEP_STATUSES, GATE_STEPS } from '../domain/gate';
import { isoDate } from './common';

export const gateJobBody = z.object({
  repoId: z.string(),
  prNumber: z.number().int().positive(),
  taskKey: z.string().min(1).optional(),
});

export const gateJobQueuedDto = z.object({
  outcome: z.enum(['queued', 'duplicate']),
  jobId: z.string().nullable(),
  headSha: z.string(),
  taskKey: z.string(),
});

export const gateJobRatifiedDto = z.object({
  jobId: z.string(),
  state: z.literal('queued'),
  headSha: z.string(),
});

/** One job in a list of the gate page. `step` is the step that failed, or the step that runs now, or `null`. */
export const gateJobDto = z.object({
  id: z.string(),
  prNumber: z.number().int(),
  title: z.string().nullable(),
  taskKey: z.string(),
  state: z.enum(GATE_JOB_STATES),
  step: z.enum(GATE_STEPS).nullable(),
  queuedAt: isoDate,
  startedAt: isoDate.nullable(),
  finishedAt: isoDate.nullable(),
  ratifiedAt: isoDate.nullable(),
});
export type GateJobDto = z.output<typeof gateJobDto>;

/** `GET /api/repos/:id/gate`: the setting of the repo, the live jobs and the record. `githubRepo` is `null` while the repo has no gate row. */
export const gateViewDto = z.object({
  enabled: z.boolean(),
  githubRepo: z.string().nullable(),
  queue: z.array(gateJobDto),
  record: z.array(gateJobDto),
});
export type GateViewDto = z.output<typeof gateViewDto>;

export const gateEnabledBody = z.object({ enabled: z.boolean() });
export type GateEnabledBody = z.output<typeof gateEnabledBody>;

export const gateStepDto = z.object({
  seq: z.number().int(),
  step: z.enum(GATE_STEPS),
  status: z.enum(GATE_STEP_STATUSES),
  exitCode: z.number().int().nullable(),
  ms: z.number().int(),
  outputTail: z.string(),
});
export type GateStepDto = z.output<typeof gateStepDto>;

/** `GET /api/gate/jobs/:id`: one job with its steps by `seq`. */
export const gateJobDetailDto = z.object({
  job: gateJobDto,
  repoId: z.string(),
  headSha: z.string(),
  steps: z.array(gateStepDto),
});
export type GateJobDetailDto = z.output<typeof gateJobDetailDto>;
