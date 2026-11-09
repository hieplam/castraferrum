// The goals page of a loop (spec 2.10, goal G11): the goal number, its rows, the standing goals and the loops whose probe failed. Read-only.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams } from '../../shared/contracts/common';
import { goalViewDto, goalViewQuery } from '../../shared/contracts/goals';
import type { GoalViewService } from '../services/contracts';
import { requireId } from './loop-routes';

export type GoalRouteDeps = { goalView: GoalViewService };

export const goalRoutes: FastifyPluginAsyncZod<GoalRouteDeps> = async (app, { goalView }) => {
  app.get('/api/loops/:id/goals', { schema: { params: idParams, querystring: goalViewQuery, response: { 200: goalViewDto } } }, async (req) =>
    goalView.view(requireId(req.params.id, 'LOOP_NOT_FOUND'), req.query.manifest),
  );
};
