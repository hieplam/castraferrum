// The goal cards (spec 2.13): a person reads them, and gives the one-word yes or no.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams } from '../../shared/contracts/common';
import { goalCardDto, goalCardListDto, goalCardListQuery } from '../../shared/contracts/goal-cards';
import type { GoalCardService } from '../services/contracts';
import { requireId } from './loop-routes';

export type GoalCardRouteDeps = { goalCards: GoalCardService };

export const goalCardRoutes: FastifyPluginAsyncZod<GoalCardRouteDeps> = async (app, { goalCards }) => {
  app.get('/api/goal-cards', { schema: { querystring: goalCardListQuery, response: { 200: goalCardListDto } } }, async (req) =>
    goalCards.list(req.query.repoId === undefined ? null : requireId(req.query.repoId, 'REPO_NOT_FOUND')),
  );

  app.post('/api/goal-cards/:id/accept', { schema: { params: idParams, response: { 200: goalCardDto } } }, async (req) => goalCards.accept(requireId(req.params.id, 'GOAL_CARD_NOT_FOUND')));

  app.post('/api/goal-cards/:id/refuse', { schema: { params: idParams, response: { 200: goalCardDto } } }, async (req) => goalCards.refuse(requireId(req.params.id, 'GOAL_CARD_NOT_FOUND')));
};
