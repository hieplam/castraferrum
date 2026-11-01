// Response of the process scoreboard API (spec 2.12, goal G15): `GET /api/process/scoreboard?tz=`.
import { z } from 'zod';
import { isoDate } from './common';

export const scoreboardQuery = z.object({ tz: z.string().default('Asia/Ho_Chi_Minh') });
export type ScoreboardQuery = z.output<typeof scoreboardQuery>;

/** The four figures of the page: causes with a repeat in the last 30 days, causes with a merged check, and the repeats before and after those checks. */
export const scoreboardFiguresDto = z.object({
  causes: z.number().int(),
  checks: z.number().int(),
  before: z.number().int(),
  after: z.number().int(),
});

/** One week, starting on Monday 00:00 in the time zone of the request: `from` is that instant. */
export const scoreboardWeekDto = z.object({ from: isoDate, repeats: z.number().int() });

/** One cause. `checkName` and `checkMergedAt` are `null` when the cause has no check, or the check has no commit yet. */
export const scoreboardCauseDto = z.object({
  fingerprint: z.string(),
  cause: z.string(),
  checkName: z.string().nullable(),
  checkMergedAt: isoDate.nullable(),
  before: z.number().int(),
  after: z.number().int(),
  repeats: z.number().int(),
});
export type ScoreboardCauseDto = z.output<typeof scoreboardCauseDto>;

export const scoreboardDto = z.object({
  figures: scoreboardFiguresDto,
  weeks: z.array(scoreboardWeekDto),
  causes: z.array(scoreboardCauseDto),
});
export type ScoreboardDto = z.output<typeof scoreboardDto>;
