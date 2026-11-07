// The gate queue (spec 2.8): a person queues a PR by hand, and ratifies a guarded change. The gate pages read a repo's queue and one job, and turn a repo's gate on and off.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams } from '../../shared/contracts/common';
import { gateEnabledBody, gateJobBody, gateJobDetailDto, gateJobQueuedDto, gateJobRatifiedDto, gateViewDto } from '../../shared/contracts/gate';
import type { GateService } from '../services/contracts';
import { requireId } from './loop-routes';

export type GateRouteDeps = { gate: GateService };

export const gateRoutes: FastifyPluginAsyncZod<GateRouteDeps> = async (app, { gate }) => {
  app.post('/api/gate/jobs', { schema: { body: gateJobBody, response: { 200: gateJobQueuedDto, 201: gateJobQueuedDto } } }, async (req, reply) => {
    const result = await gate.queue({ ...req.body, repoId: requireId(req.body.repoId, 'REPO_NOT_FOUND') });
    return reply.code(result.outcome === 'queued' ? 201 : 200).send(result);
  });

  app.get('/api/repos/:id/gate', { schema: { params: idParams, response: { 200: gateViewDto } } }, async (req) => gate.view(requireId(req.params.id, 'REPO_NOT_FOUND')));

  app.put('/api/repos/:id/gate', { schema: { params: idParams, body: gateEnabledBody, response: { 200: gateViewDto } } }, async (req) =>
    gate.setEnabled(requireId(req.params.id, 'REPO_NOT_FOUND'), req.body.enabled),
  );

  app.get('/api/gate/jobs/:id', { schema: { params: idParams, response: { 200: gateJobDetailDto } } }, async (req) => gate.job(requireId(req.params.id, 'GATE_JOB_NOT_FOUND')));

  app.post('/api/gate/jobs/:id/ratify', { schema: { params: idParams, response: { 200: gateJobRatifiedDto } } }, async (req) => gate.ratify(requireId(req.params.id, 'GATE_JOB_NOT_FOUND')));
};
