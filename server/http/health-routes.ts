import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { healthResponse } from '../../shared/contracts/health';
import type { HealthService } from '../services/contracts';

export const healthRoutes: FastifyPluginAsyncZod<{ health: HealthService }> = async (app, { health }) => {
  app.get(
    '/api/health',
    { schema: { response: { 200: healthResponse, 503: healthResponse } } },
    async (_req, reply) => {
      const report = await health.check();
      return reply.code(report.ok ? 200 : 503).send(report);
    },
  );
};
