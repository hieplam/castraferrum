// The gate queue (spec 2.8): a person queues a PR by hand, and ratifies a guarded change.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams } from '../../shared/contracts/common';
import { gateJobBody, gateJobQueuedDto, gateJobRatifiedDto } from '../../shared/contracts/gate';
import type { GateService } from '../services/contracts';
import { requireId } from './loop-routes';

export type GateRouteDeps = { gate: GateService };

export const gateRoutes: FastifyPluginAsyncZod<GateRouteDeps> = async (app, { gate }) => {
  app.post('/api/gate/jobs', { schema: { body: gateJobBody, response: { 200: gateJobQueuedDto, 201: gateJobQueuedDto } } }, async (req, reply) => {
    const result = await gate.queue({ ...req.body, repoId: requireId(req.body.repoId, 'REPO_NOT_FOUND') });
    return reply.code(result.outcome === 'queued' ? 201 : 200).send(result);
  });

  app.post('/api/gate/jobs/:id/ratify', { schema: { params: idParams, response: { 200: gateJobRatifiedDto } } }, async (req) => gate.ratify(requireId(req.params.id, 'GATE_JOB_NOT_FOUND')));
};
