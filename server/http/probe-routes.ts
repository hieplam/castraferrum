// Probe settings of a loop (goal-driven loop, spec 2.1): read, save, delete. P4 adds the tick that calls the probe.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams } from '../../shared/contracts/common';
import { probeEnvelopeDto, probeInputBody } from '../../shared/contracts/goal-loop';
import type { ProbeService } from '../services/contracts';
import { requireId } from './loop-routes';

export type ProbeRouteDeps = { probes: ProbeService };

export const probeRoutes: FastifyPluginAsyncZod<ProbeRouteDeps> = async (app, { probes }) => {
  app.get('/api/loops/:id/probe', { schema: { params: idParams, response: { 200: probeEnvelopeDto } } }, async (req) => ({
    probe: await probes.get(requireId(req.params.id, 'LOOP_NOT_FOUND')),
  }));

  app.put(
    '/api/loops/:id/probe',
    { schema: { params: idParams, body: probeInputBody, response: { 200: probeEnvelopeDto } } },
    async (req) => ({ probe: await probes.save(requireId(req.params.id, 'LOOP_NOT_FOUND'), req.body) }),
  );

  app.delete('/api/loops/:id/probe', { schema: { params: idParams } }, async (req, reply) => {
    await probes.remove(requireId(req.params.id, 'LOOP_NOT_FOUND'));
    return reply.code(204).send();
  });
};
