// Process review routes (spec 2.12): the run events of a period, read-only.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { processEventsDto, processEventsQuery } from '../../shared/contracts/process';
import type { ProcessService } from '../services/contracts';

export type ProcessRouteDeps = { processEvents: ProcessService };

export const processRoutes: FastifyPluginAsyncZod<ProcessRouteDeps> = async (app, { processEvents }) => {
  app.get(
    '/api/process/events',
    { schema: { querystring: processEventsQuery, response: { 200: processEventsDto } } },
    async (req) => ({ events: await processEvents.events(req.query.from, req.query.to) }),
  );
};
