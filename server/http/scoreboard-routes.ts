// The process scoreboard (spec 2.12, goal G15): the repeats of each known cause before and after the date its check merged, read-only.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { scoreboardDto, scoreboardQuery } from '../../shared/contracts/scoreboard';
import type { ScoreboardService } from '../services/contracts';

export type ScoreboardRouteDeps = { scoreboard: ScoreboardService };

export const scoreboardRoutes: FastifyPluginAsyncZod<ScoreboardRouteDeps> = async (app, { scoreboard }) => {
  app.get(
    '/api/process/scoreboard',
    { schema: { querystring: scoreboardQuery, response: { 200: scoreboardDto } } },
    async (req) => scoreboard.scoreboard(req.query.tz),
  );
};
