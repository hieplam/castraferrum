// The shared repo for e2e / visual / seed (phase 2: a loop must be attached to exactly one repo). The machine temp folder is a folder that
// already exists - enough for Mock (ignores cwd); a fixed id so the SQL seed and the preview data match between runs.
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type pg from 'pg';

export const TEST_REPO = {
  id: '0e2e0000-0000-4000-8000-00000000c0de',
  name: 'Atlas',
  /** Canonical form (realpath) - exactly the string the server stores when registered through the API. */
  path: realpathSync(tmpdir()),
} as const;

/** Write the test repo straight into the DB (SQL seed); if it is there already, do nothing. */
export async function seedTestRepo(db: pg.ClientBase | pg.Pool): Promise<string> {
  await db.query(
    `INSERT INTO repos (id, name, path, created_at) VALUES ($1, $2, $3, '2026-10-01T00:00:00Z') ON CONFLICT DO NOTHING`,
    [TEST_REPO.id, TEST_REPO.name, TEST_REPO.path],
  );
  return TEST_REPO.id;
}

type Caller = (method: 'GET' | 'POST', url: string, body?: unknown) => Promise<{ status: number; body: unknown }>;

/** Register the test repo through `POST /api/repos` (after `/api/__test/reset`); if it exists, take the id from `GET /api/repos`. */
export async function ensureTestRepo(call: Caller): Promise<string> {
  const res = await call('POST', '/api/repos', { path: TEST_REPO.path, name: TEST_REPO.name });
  if (res.status === 201) return (res.body as { id: string }).id;
  const list = (await call('GET', '/api/repos')).body as { items: { id: string; path: string }[] };
  const hit = list.items.find((r) => r.path === TEST_REPO.path);
  if (!hit) throw new Error(`Could not register the test repo (${res.status} ${JSON.stringify(res.body)})`);
  return hit.id;
}
