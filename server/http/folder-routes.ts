// Folder browsing routes (SPEC-phase-2 § API contract): the "Browse…" box on the Repo page — read-only, registration still goes through POST /repos.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { folderDto, folderPlacesDto, folderQuery } from '../../shared/contracts/folders';
import type { FolderService } from '../services/contracts';

export type FolderRouteDeps = { folders: FolderService };

export const folderRoutes: FastifyPluginAsyncZod<FolderRouteDeps> = async (app, { folders }) => {
  app.get('/api/folders', { schema: { querystring: folderQuery, response: { 200: folderDto } } }, async (req) => folders.browse(req.query.path));

  app.get('/api/folders/places', { schema: { response: { 200: folderPlacesDto } } }, async () => folders.places());
};
