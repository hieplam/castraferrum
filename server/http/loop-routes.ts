// Routes for loop + execution + run + log (SPEC § API contract). Each route: parse/validate (shared/contracts schema) → call the
// service through its interface → return a DTO (the zod codec turns Date → ISO). Business errors are left to the app error handler to map to an HTTP status.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams } from '../../shared/contracts/common';
import {
  executionDetailDto,
  executionPageDto,
  logListDto,
  logsQuery,
  loopDetailDto,
  loopDto,
  loopInputBody,
  loopListDto,
  loopListQuery,
  loopPageQuery,
  loopUpdateBody,
  overviewDto,
  overviewQuery,
  runDto,
  runPageDto,
} from '../../shared/contracts/loops';
import { DomainError, type ErrorCode } from '../../shared/domain/errors';
import type { LoopFilter, LoopService, RunService } from '../services/contracts';

export type LoopRouteDeps = { loops: LoopService; runs: RunService };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id that is not a uuid is certainly not in the DB → 404 for the right resource type (do not let Postgres raise 22P02). */
export function requireId(id: string, code: Extract<ErrorCode, `${string}_NOT_FOUND`>): string {
  if (!UUID.test(id)) throw new DomainError(code, `${id} does not exist`);
  return id;
}

export const loopRoutes: FastifyPluginAsyncZod<LoopRouteDeps> = async (app, { loops, runs }) => {
  app.get('/api/loops', { schema: { querystring: loopListQuery, response: { 200: loopListDto } } }, async (req) => {
    const { status, q, archived, repoId } = req.query;
    const filter: LoopFilter = {};
    if (status) filter.status = status;
    if (repoId) {
      if (!UUID.test(repoId)) return { items: [] }; // an unknown id certainly matches no repo → no loops
      filter.repoId = repoId;
    }
    if (q?.trim()) filter.q = q.trim();
    if (archived !== undefined) filter.archived = archived;
    return { items: await loops.list(filter) };
  });

  // Overview bar + loop counts per tab (UC-03).
  app.get('/api/stats', { schema: { querystring: overviewQuery, response: { 200: overviewDto } } }, async (req) => {
    return loops.overview(req.query.tz, req.query.repoId);
  });

  app.post('/api/loops', { schema: { body: loopInputBody, response: { 201: loopDto } } }, async (req, reply) => {
    return reply.code(201).send(await loops.create(req.body));
  });

  app.get('/api/loops/:id', { schema: { params: idParams, response: { 200: loopDetailDto } } }, async (req) => {
    return loops.get(requireId(req.params.id, 'LOOP_NOT_FOUND'));
  });

  app.put('/api/loops/:id', { schema: { params: idParams, body: loopUpdateBody, response: { 200: loopDto } } }, async (req) => {
    const { version, ...input } = req.body;
    return loops.update(requireId(req.params.id, 'LOOP_NOT_FOUND'), input, version);
  });

  const action = (name: 'start' | 'stop' | 'restore') =>
    app.post(`/api/loops/:id/${name}`, { schema: { params: idParams, response: { 200: loopDto } } }, async (req) => {
      return loops[name](requireId(req.params.id, 'LOOP_NOT_FOUND'));
    });
  action('start'); // UC-04: open an execution + its first run starts immediately
  action('stop'); // UC-05: close the execution + cancel the running run
  action('restore'); // UC-11

  app.post('/api/loops/:id/duplicate', { schema: { params: idParams, response: { 201: loopDto } } }, async (req, reply) => {
    return reply.code(201).send(await loops.duplicate(requireId(req.params.id, 'LOOP_NOT_FOUND'))); // UC-10
  });

  app.post('/api/loops/:id/archive', { schema: { params: idParams } }, async (req, reply) => {
    await loops.archive(requireId(req.params.id, 'LOOP_NOT_FOUND')); // UC-11
    return reply.code(204).send();
  });

  app.get(
    '/api/loops/:id/executions',
    { schema: { params: idParams, querystring: loopPageQuery, response: { 200: executionPageDto } } },
    async (req) => loops.listExecutions(requireId(req.params.id, 'LOOP_NOT_FOUND'), req.query),
  );

  app.get('/api/executions/:id', { schema: { params: idParams, response: { 200: executionDetailDto } } }, async (req) => {
    return loops.getExecution(requireId(req.params.id, 'EXECUTION_NOT_FOUND')); // UC-08
  });

  app.get(
    '/api/loops/:id/runs',
    { schema: { params: idParams, querystring: loopPageQuery, response: { 200: runPageDto } } },
    async (req) => runs.listByLoop(requireId(req.params.id, 'LOOP_NOT_FOUND'), req.query),
  );

  app.get('/api/runs/:id', { schema: { params: idParams, response: { 200: runDto } } }, async (req) => {
    return runs.get(requireId(req.params.id, 'RUN_NOT_FOUND')); // UC-07
  });

  app.get(
    '/api/runs/:id/logs',
    { schema: { params: idParams, querystring: logsQuery, response: { 200: logListDto } } },
    async (req) => ({ items: await runs.logs(requireId(req.params.id, 'RUN_NOT_FOUND'), req.query.after) }),
  );
};
