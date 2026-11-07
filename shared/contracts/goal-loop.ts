// Request / response of the probe settings API (`/api/loops/:id/probe`, spec 2.1 and 2.2).
// Only the types are checked here; the data rules (placeholders, reserved names) are checked by the probe service.
import { z } from 'zod';
import { PROBE_STATES, RESTART_POLICIES } from '../domain/goal-loop';
import { isoDate } from './common';

const argv = z.array(z.string());

const probeResourceDto = z.object({ name: z.string(), check: argv, everySec: z.number().int() });

/** Body of `PUT /loops/:id/probe`. An omitted field takes its default: empty list, empty map, no base port, restart policy `stop`, rank 100, no token budget. */
export const probeInputBody = z.object({
  command: argv,
  claim: argv.optional(),
  release: argv.optional(),
  resources: z.array(probeResourceDto).optional(),
  laneEnv: z.record(z.string(), z.string()).optional(),
  laneBasePort: z.number().int().nullable().optional(),
  restartPolicy: z.enum(RESTART_POLICIES).optional(),
  rank: z.number().int().optional(),
  tokenBudget: z.number().int().nullable().optional(),
});
export type ProbeInputBody = z.input<typeof probeInputBody>;

export const probeDto = z.object({
  loopId: z.string(),
  command: argv,
  claim: argv,
  release: argv,
  resources: z.array(probeResourceDto),
  laneEnv: z.record(z.string(), z.string()),
  laneBasePort: z.number().int().nullable(),
  restartPolicy: z.enum(RESTART_POLICIES),
  rank: z.number().int(),
  tokenBudget: z.number().int().nullable(),
  state: z.enum(PROBE_STATES),
  lastLine: z.string().nullable(),
  lastProbeAt: isoDate.nullable(),
});
export type ProbeDto = z.output<typeof probeDto>;

/** `GET` and `PUT /loops/:id/probe`: a loop with no probe gives `{ probe: null }`. */
export const probeEnvelopeDto = z.object({ probe: probeDto.nullable() });
