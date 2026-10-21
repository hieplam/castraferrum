// Test-mode routes (SPEC § API contract): registered ONLY when main.ts passes `testHooks` — i.e. `LOOPS_TEST_MODE=1` with a DB
// named `*_test` (config.ts enforces this). A normal run has no such routes → 404 like any unknown path.
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { testFoldersBody, type TestFoldersBody } from '../../shared/contracts/folders';
import { testClockBody, testClockDto, testDirsBody } from '../../shared/contracts/loops';

/** What the composition root supplies in test mode. Structural type — the HTTP layer does not know which adapter is behind it. */
export type TestHooks = {
  clock: { advance(ms: number): Date; set(at: Date): Date };
  /** Forces "folder present / missing" for an exact path string — the `exists` flag of `GET /api/repos`. Reset clears everything. */
  directories: { set(paths: Record<string, boolean>): void };
  /** Replaces the "machine" behind the "Browse…" box with a fake folder world; `null` = the real machine. Reset goes back to the real machine. */
  folders: { set(world: TestFoldersBody['world']): void };
  /** Stops every running run, wipes all data, and puts the clock back to real time. */
  reset(): Promise<void>;
};

export const testRoutes: FastifyPluginAsyncZod<{ hooks: TestHooks }> = async (app, { hooks }) => {
  app.post('/api/__test/clock', { schema: { body: testClockBody, response: { 200: testClockDto } } }, async (req) => {
    const body = req.body;
    return { now: 'advanceMs' in body ? hooks.clock.advance(body.advanceMs) : hooks.clock.set(body.at) };
  });

  app.post('/api/__test/dirs', { schema: { body: testDirsBody } }, async (req, reply) => {
    hooks.directories.set(req.body.paths);
    return reply.code(204).send();
  });

  app.post('/api/__test/folders', { schema: { body: testFoldersBody } }, async (req, reply) => {
    hooks.folders.set(req.body.world);
    return reply.code(204).send();
  });

  app.post('/api/__test/reset', async (_req, reply) => {
    await hooks.reset();
    return reply.code(204).send();
  });
};
