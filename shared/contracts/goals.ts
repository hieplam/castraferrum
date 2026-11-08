// Response of the goals page API (spec 2.10, goal G11): `GET /api/loops/:id/goals?manifest=<path>`.
// A loop with no gate row, or a repository with no stored goal row, gives `manifest: null` and empty lists.
import { z } from 'zod';
import { PROBE_STATES } from '../domain/goal-loop';
import { isoDate } from './common';

export const goalViewQuery = z.object({ manifest: z.string().min(1).optional() });
export type GoalViewQuery = z.output<typeof goalViewQuery>;

/** One goal of the manifest, in file order. A goal with no stored row has `pass: false` and an empty `line`. */
export const goalRowDto = z.object({ id: z.string(), outcome: z.string(), pass: z.boolean(), line: z.string() });
export type GoalRowDto = z.output<typeof goalRowDto>;

/** The count of the manifest when it was opened: `at` is the text of the file, not checked here. */
export const goalOpenedDto = z.object({ at: z.string(), passed: z.number().int(), total: z.number().int() });

/** One row of `goals/health.json`. The three fields about an issue are `null` when the row has none. */
export const standingRowDto = z.object({
  id: z.string(),
  command: z.string(),
  pass: z.boolean(),
  openSince: isoDate.nullable(),
  lastFailedAt: isoDate.nullable(),
  issue: z.number().int().nullable(),
});
export type StandingRowDto = z.output<typeof standingRowDto>;

/** A loop of the repository whose probe failed. */
export const goalLoopDto = z.object({ id: z.string(), name: z.string(), state: z.enum(PROBE_STATES), text: z.string().nullable() });
export type GoalLoopDto = z.output<typeof goalLoopDto>;

export const goalViewDto = z.object({
  manifest: z.string().nullable(),
  checkedAt: isoDate.nullable(),
  /** The first 7 characters of the commit of the newest row. */
  sha: z.string().nullable(),
  passed: z.number().int(),
  total: z.number().int(),
  opened: goalOpenedDto.nullable(),
  rows: z.array(goalRowDto),
  standing: z.array(standingRowDto),
  loops: z.array(goalLoopDto),
});
export type GoalViewDto = z.output<typeof goalViewDto>;
