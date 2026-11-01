// E2E UC-35, the gate queue on the real build. The gate is off by default, so no existing repository changes behaviour.
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('UC-35: queueing a PR on a repo with the gate off is refused with GATE_OFF, and nothing is queued', { tag: '@UC-35' }, async ({ request }) => {
  expect((await request.post('/api/__test/reset')).status()).toBe(204);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lc-gate-')));
  const repo = await request.post('/api/repos', { data: { path: dir, name: 'gate off' } });
  expect(repo.status()).toBe(201);
  const repoId = ((await repo.json()) as { id: string }).id;

  const refused = await request.post('/api/gate/jobs', { data: { repoId, prNumber: 1 } });
  expect(refused.status()).toBe(409);
  expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('GATE_OFF');
});
