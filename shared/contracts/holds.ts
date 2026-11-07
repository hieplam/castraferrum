// Response of the holds API (spec 2.5): `GET /api/holds`, the open holds.
import { z } from 'zod';
import { isoDate } from './common';

export const holdDto = z.object({
  id: z.string(),
  resource: z.string(),
  reason: z.string(),
  openedAt: isoDate,
  /** `null` = the end is not known (decision 27). */
  until: isoDate.nullable(),
  /** The run that opened the hold. A probe line opens a hold with no run. */
  openedByRun: z.object({ id: z.string(), iteration: z.number().int().nullable() }).nullable(),
});
export type HoldDto = z.output<typeof holdDto>;

export const holdListDto = z.object({ holds: z.array(holdDto) });
