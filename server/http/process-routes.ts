// Process review routes (spec 2.12): the run events, the refused gate jobs and the loop comments of a period, read-only.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { processEventsDto, processEventsQuery, processSignalsDto, processSignalsQuery } from '../../shared/contracts/process';
import type { ProcessService } from '../services/contracts';

export type ProcessRouteDeps = { processEvents: ProcessService };

export const processRoutes: FastifyPluginAsyncZod<ProcessRouteDeps> = async (app, { processEvents }) => {
  app.get(
    '/api/process/events',
    { schema: { querystring: processEventsQuery, response: { 200: processEventsDto } } },
    async (req) => ({ events: await processEvents.events(req.query.from, req.query.to) }),
  );
  app.get(
    '/api/process/signals',
    { schema: { querystring: processSignalsQuery, response: { 200: processSignalsDto } } },
    async (req) => processEvents.signals(req.query.from, req.query.to, req.query.repo),
  );
};
