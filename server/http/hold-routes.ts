// Hold routes (spec 2.5): the open holds, read-only. The hold banner of the loop page reads them (goal G28).
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { holdListDto } from '../../shared/contracts/holds';
import type { HoldService } from '../services/contracts';

export type HoldRouteDeps = { holds: HoldService };

export const holdRoutes: FastifyPluginAsyncZod<HoldRouteDeps> = async (app, { holds }) => {
  app.get('/api/holds', { schema: { response: { 200: holdListDto } } }, async () => ({ holds: await holds.listOpen() }));
};
