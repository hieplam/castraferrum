// Request / response of the process review API (spec 2.12): `GET /api/process/events?from=&to=` and `GET /api/process/signals?from=&to=&repo=`.
import { z } from 'zod';
import { RUN_STATUSES } from '../domain/run';
import { isoDate } from './common';

export const processEventsQuery = z.object({ from: isoDate, to: isoDate });
export type ProcessEventsQuery = z.output<typeof processEventsQuery>;

/** One run, without a loop name, a prompt or a path: `loop` is the loop id. `text` joins the non-empty error, summary and skip reason. */
export const processEventDto = z.object({
  id: z.string(),
  at: isoDate,
  loop: z.string(),
  status: z.enum(RUN_STATUSES),
  text: z.string(),
});
export type ProcessEventDto = z.output<typeof processEventDto>;

export const processEventsDto = z.object({ events: z.array(processEventDto) });

/** `repo` is the GitHub name `owner/name`. */
export const processSignalsQuery = z.object({ from: isoDate, to: isoDate, repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/) });
export type ProcessSignalsQuery = z.output<typeof processSignalsQuery>;

/** A refused gate job or a `loop-release:` comment (decision 48). It holds no loop name, prompt, PR number, commit or repository id. */
export const processSignalDto = z.object({
  id: z.string(),
  at: isoDate,
  kind: z.enum(['gate', 'comment']),
  text: z.string(),
});
export type ProcessSignalDto = z.output<typeof processSignalDto>;

export const processSignalsDto = z.object({ gate: z.array(processSignalDto), comments: z.array(processSignalDto) });
