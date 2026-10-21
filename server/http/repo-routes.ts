// Repo routes (SPEC-phase-2 § API contract): register (UC-19), list, delete (UC-20).
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams } from '../../shared/contracts/common';
import { repoDto, repoInputBody, repoListDto } from '../../shared/contracts/repos';
import type { RepoService } from '../services/contracts';
import { requireId } from './loop-routes';

export type RepoRouteDeps = { repos: RepoService };

export const repoRoutes: FastifyPluginAsyncZod<RepoRouteDeps> = async (app, { repos }) => {
  app.get('/api/repos', { schema: { response: { 200: repoListDto } } }, async () => ({ items: await repos.list() }));

  app.post('/api/repos', { schema: { body: repoInputBody, response: { 201: repoDto } } }, async (req, reply) => {
    return reply.code(201).send(await repos.register(req.body));
  });

  app.delete('/api/repos/:id', { schema: { params: idParams } }, async (req, reply) => {
    await repos.remove(requireId(req.params.id, 'REPO_NOT_FOUND'));
    return reply.code(204).send();
  });
};
