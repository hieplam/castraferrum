// Request / response of the gate queue (`POST /api/gate/jobs`, `POST /api/gate/jobs/:id/ratify`, spec 2.8).
import { z } from 'zod';

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
