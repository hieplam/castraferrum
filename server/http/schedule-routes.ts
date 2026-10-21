// `GET /api/schedule/preview` (description sentence + next 5 runs — the same shared/domain functions the UI can call itself) and
// `GET /api/executors` (available executors + config JSON Schema so the form builds itself).
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { executorListDto, schedulePreviewDto, schedulePreviewQuery } from '../../shared/contracts/loops';
import { DomainError } from '../../shared/domain/errors';
import { describe, isValidTimeZone, nextRuns, validate, warnings } from '../../shared/domain/schedule';
import type { LoopService } from '../services/contracts';
import { HttpError } from './errors';

export type ScheduleRouteDeps = { loops: LoopService; now: () => Date };

const PREVIEW_COUNT = 5;

export const scheduleRoutes: FastifyPluginAsyncZod<ScheduleRouteDeps> = async (app, { loops, now }) => {
  app.get(
    '/api/schedule/preview',
    { schema: { querystring: schedulePreviewQuery, response: { 200: schedulePreviewDto } } },
    async (req) => {
      const { cron, tz, lang } = req.query;
      const check = validate(cron, lang);
      if (!check.ok) throw new HttpError(400, 'INVALID_CRON', check.error.message, check.error);
      if (!isValidTimeZone(tz)) {
        const message = `Unknown time zone "${tz}"`;
        throw new DomainError('VALIDATION_FAILED', message, { issues: [{ field: 'tz', code: 'invalid', message }] });
      }
      return {
        cron: check.cron,
        description: describe(check.cron, lang),
        nextRuns: nextRuns(check.cron, tz, now(), PREVIEW_COUNT),
        warnings: warnings(check.cron, lang),
      };
    },
  );

  app.get('/api/executors', { schema: { response: { 200: executorListDto } } }, async () => ({
    items: loops.executors().map((d) => ({
      kind: d.kind,
      label: d.label,
      cancelWithinMs: d.cancelWithinMs,
      configSchema: z.toJSONSchema(d.configSchema, { io: 'input' }) as Record<string, unknown>,
    })),
  }));
};
