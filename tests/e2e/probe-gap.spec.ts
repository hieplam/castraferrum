/// <reference lib="dom" />
// E2E for the gap between two tasks (goal-driven loop, G2): when a run ends, the next task starts within seconds, not at the next cron mark or the next
// 60 s probe. Real from end to end: Fastify -> Postgres (test DB, test mode) -> the background tick -> a real probe child process (tests/support/fake-labels.mjs)
// -> the real ClaudeAgentExecutor with a fake Claude (repo `lc-fake-claude-*`, prompt `[soak:2]`). The clock is the real one: no `advanceMs`.
// The test prints `gap_ms=<n>`: the second `started_at` less the first `finished_at`, read from the DB.
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { databaseUrl, loadDotEnv } from '../../server/config';
import { FAKE_CLAUDE_DIR_PREFIX } from '../../server/adapters/executors/claude/test-mode-query';

loadDotEnv();

const FAKE_LABELS = resolve('tests/support/fake-labels.mjs');
const GAP_LIMIT_MS = 15_000;

let db: pg.Pool;
test.beforeAll(() => {
  db = new pg.Pool({ connectionString: databaseUrl(process.env, 'test'), max: 3 });
});
test.afterAll(async () => {
  await db?.end();
});
test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/__test/reset')).status()).toBe(204);
});

type RunRow = { trigger: string; started_at: Date; finished_at: Date | null };
const runsOf = async (loopId: string) =>
  (await db.query<RunRow>('SELECT trigger, started_at, finished_at FROM runs WHERE loop_id = $1 ORDER BY started_at, id', [loopId])).rows;

test('G2: with two tasks in the queue and one lane, the second run starts seconds after the first run ends', async ({ request }) => {
  test.setTimeout(120_000);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), FAKE_CLAUDE_DIR_PREFIX)));
  const repo = await request.post('/api/repos', { data: { path: dir, name: 'gap repo' } });
  expect(repo.status()).toBe(201);
  const world = realpathSync(mkdtempSync(join(tmpdir(), 'lc-gap-')));
  writeFileSync(join(world, 'queue.json'), JSON.stringify(['a', 'b']));
  writeFileSync(join(world, 'calls.log'), '');
  const argv = (...rest: string[]) => [process.execPath, FAKE_LABELS, world, ...rest];

  const created = await request.post('/api/loops', {
    data: {
      name: 'gap loop',
      description: 'description',
      prompt: 'Handle one task [soak:2]',
      repoId: ((await repo.json()) as { id: string }).id,
      cron: '0 0 1 1 *', // once a year: only the probe starts work
      timezone: 'Asia/Ho_Chi_Minh',
      timeoutSec: 600,
      maxConcurrent: 1,
      executor: { kind: 'claude', config: { model: 'opus', effort: 'medium' } },
    },
  });
  expect(created.status()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  const saved = await request.put(`/api/loops/${id}/probe`, {
    data: { command: argv('next'), claim: argv('claim', '{key}'), release: argv('release', '{key}', '--if-claimed', '--reason', '{reason}') },
  });
  expect(saved.status()).toBe(200);
  expect((await request.post(`/api/loops/${id}/start`)).status()).toBe(200);

  // Poll at most 60 s for the second run. The probe opens both of them.
  const end = Date.now() + 60_000;
  let rows = await runsOf(id);
  while (rows.length < 2 && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 200));
    rows = await runsOf(id);
  }
  expect(rows.length).toBe(2);
  expect(rows.map((r) => r.trigger)).toEqual(['probe', 'probe']);
  const finished = rows[0]!.finished_at;
  expect(finished).not.toBeNull();
  const gap = rows[1]!.started_at.getTime() - finished!.getTime();
  console.log(`gap_ms=${gap}`);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(GAP_LIMIT_MS);
});
