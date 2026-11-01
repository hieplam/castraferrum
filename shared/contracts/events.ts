// SSE events (ARCHITECTURE.md section "Events to the web"). Each event carries only an id + a few fields: the web learns what
// changed and reloads through the API (TanStack Query invalidate).
//
// `GET /api/events` - each event:   `event: <type>` + `data: <JSON of stateEventDto>`; heartbeat `:ping` every 15 seconds.
// `GET /api/runs/:id/logs/stream` - `id: <seq>` + `event: log` + `data: <JSON of logLineDto>`; when the run ends ->
//                                   `event: end` + `data: <JSON of logStreamEndDto>`, then the server closes the stream.
import { z } from 'zod';
import { RUN_STATUSES } from '../domain/run';
import { isoDate } from './common';

const base = { at: isoDate, loopId: z.string() };

/** State events - exactly the kinds `/api/events` emits (no `run.log`). */
export const stateEventDto = z.discriminatedUnion('type', [
  z.object({ type: z.literal('loop.created'), ...base }),
  z.object({ type: z.literal('loop.updated'), ...base }),
  z.object({ type: z.literal('execution.started'), ...base, executionId: z.string(), seq: z.number().int() }),
  z.object({
    type: z.literal('execution.ended'),
    ...base,
    executionId: z.string(),
    reason: z.enum(['stopped', 'server_down', 'goal_met']),
  }),
  z.object({
    type: z.literal('run.started'),
    ...base,
    executionId: z.string(),
    runId: z.string(),
    iteration: z.number().int(),
  }),
  z.object({
    type: z.literal('run.finished'),
    ...base,
    executionId: z.string(),
    runId: z.string(),
    status: z.enum(RUN_STATUSES),
  }),
  z.object({ type: z.literal('run.skipped'), ...base, executionId: z.string(), runId: z.string(), reason: z.string() }),
]);
export type StateEventDto = z.output<typeof stateEventDto>;
export type StateEventType = StateEventDto['type'];

/** The last event of the log stream: the run ended with this status. */
export const logStreamEndDto = z.object({ runId: z.string(), status: z.enum(RUN_STATUSES) });
export type LogStreamEndDto = z.output<typeof logStreamEndDto>;
