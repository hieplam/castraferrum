// Request / response of the process review API (spec 2.12): `GET /api/process/events?from=&to=`.
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
