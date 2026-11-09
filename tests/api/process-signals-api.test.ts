// Process signals API (goal G14, spec decision 48): gate refusals and loop-release comments, without names.
// Real server (composeServer) on the test Postgres. Gate jobs go in through the repository. GitHub is the fake `gh`: no real call.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPgRepositories } from '../../server/adapters/postgres/repositories';
import type { GateStepName } from '../../shared/domain/gate';
import { loopBody, resetApi, startApi, testPool, type ApiServer } from '../support/api-kit';
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh } from '../support/fake-gh-kit';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HEAD = 'abcdef0123456789abcdef0123456789abcdef01';
const PR_NUMBER = 7777;
const FROM = '2026-10-19T00:00:00.000Z';
const TO = '2026-10-21T00:00:00.000Z';
const REPO = 'hieplam/tribe';

let server: ApiServer;
let gh: FakeGh;
let pool: pg.Pool;
let repoId: string;
let saved: string | undefined;

beforeAll(async () => {
  gh = createFakeGh();
  saved = process.env.FAKE_GH_WORLD;
  process.env.FAKE_GH_WORLD = gh.world;
  server = await startApi({ ghBin: FAKE_GH_SCRIPT }, { ticker: false });
  pool = testPool();
});
afterAll(async () => {
  await server?.shutdown();
  await pool?.end();
  gh?.dispose();
  if (saved === undefined) delete process.env.FAKE_GH_WORLD;
  else process.env.FAKE_GH_WORLD = saved;
});
beforeEach(async () => {
  process.env.FAKE_GH_WORLD = gh.world;
  repoId = await resetApi(server);
  writeWorld([]);
});

function writeWorld(issues: Json[]): void {
  const world = gh.read();
  world.issues = issues as never;
  writeFileSync(gh.world, JSON.stringify(world));
}
type SeedComment = { id: string; createdAt: string; body: string; authorAssociation?: string };
function issue(number: number, comments: SeedComment[], updatedAt = '2026-10-20T00:00:00.000Z'): Json {
  return { number, title: 't', body: 'b', state: 'OPEN', labels: [], comments: comments.map((c) => ({ authorAssociation: 'OWNER', ...c })), url: `https://github.com/${REPO}/issues/${number}`, createdAt: updatedAt, updatedAt, closedAt: null };
}
/** A gate job that ends in `state` at `finishedAt`, with one failing step. */
async function endJob(state: 'failed' | 'needs_ratification' | 'merged', finishedAt: string, step: GateStepName, tail: string): Promise<string> {
  const gate = createPgRepositories(pool).gate;
  const id = randomUUID();
  const before = new Date(Date.parse(finishedAt) - 60_000);
  await gate.enqueue({ id, repoId, prNumber: PR_NUMBER, headSha: HEAD, taskKey: '141', at: before });
  await gate.takeNext(before);
  await gate.appendStep({ jobId: id, seq: 1, step, status: state === 'merged' ? 'pass' : 'fail', exitCode: 1, ms: 5, outputTail: tail });
  await gate.finish(id, { state, failedStep: state === 'merged' ? null : step, at: new Date(finishedAt) });
  return id;
}
async function signals(from = FROM, to = TO, repo = REPO) {
  const url = `/api/process/signals?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&repo=${encodeURIComponent(repo)}`;
  const res = await server.app.inject({ method: 'GET', url });
  return { status: res.statusCode, text: res.body, body: (res.body ? res.json() : null) as Json };
}

describe('GET /api/process/signals (G14)', () => {
  it('the test server leaves a queued gate job to the test (no gate ticker runs beside endJob)', async () => {
    const id = randomUUID();
    await createPgRepositories(pool).gate.enqueue({ id, repoId, prNumber: PR_NUMBER, headSha: HEAD, taskKey: '141', at: new Date() });
    await new Promise((r) => setTimeout(r, 500)); // five tick periods of the 100 ms ticker, if it ran
    const { rows } = await pool.query('SELECT state FROM gate_jobs WHERE id = $1', [id]);
    expect(rows[0].state).toBe('queued');
  });

  it('a failed gate job gives an item whose text is the failed step and the first failing line of its output', async () => {
    const id = await endJob('failed', '2026-10-20T10:00:00Z', 'green', 'ok 1\n  FAIL tests/x.test.ts expected 1 got 2\nlast line');
    const res = await signals();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      gate: [{ id: `gate:${id}`, at: '2026-10-20T10:00:00.000Z', kind: 'gate', text: 'green: FAIL tests/x.test.ts expected 1 got 2' }],
      comments: [],
    });
  });

  it('a needs_ratification job gives the scope step, and a long text is cut at 2000 characters', async () => {
    await endJob('needs_ratification', '2026-10-20T10:00:00Z', 'scope', 'scope fail: the PR changes guarded files');
    await endJob('failed', '2026-10-20T11:00:00Z', 'verify', `error ${'x'.repeat(3000)}`);
    const res = await signals();
    expect(res.body.gate[0].text).toBe('scope: scope fail: the PR changes guarded files');
    expect(res.body.gate[1].text).toBe(`verify: error ${'x'.repeat(1986)}`);
    expect(res.body.gate[1].text).toHaveLength(2000);
  });

  it('a merged job and a queued job give no item', async () => {
    await endJob('merged', '2026-10-20T10:00:00Z', 'merge', 'merged ok');
    const gate = createPgRepositories(pool).gate;
    await gate.enqueue({ id: randomUUID(), repoId, prNumber: 8, headSha: 'b'.repeat(40), taskKey: '142', at: new Date('2026-10-20T12:00:00Z') });
    const res = await signals();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ gate: [], comments: [] });
  });

  it('includes an item at from, excludes an item at to, for the gate and for the comments', async () => {
    const inGate = await endJob('failed', FROM, 'green', 'FAIL at from');
    await endJob('failed', TO, 'green', 'FAIL at to');
    writeWorld([
      issue(11, [
        { id: 'IC_in', createdAt: FROM, body: 'loop-release: at from' },
        { id: 'IC_out', createdAt: TO, body: 'loop-release: at to' },
      ]),
    ]);
    const res = await signals();
    expect(res.body.gate.map((g: Json) => g.id)).toEqual([`gate:${inGate}`]);
    expect(res.body.comments.map((c: Json) => c.id)).toEqual(['comment:11:IC_in']);
  });

  it('a loop-release comment gives its reason lines and its loop-found line, without the boilerplate', async () => {
    writeWorld([
      issue(12, [
        {
          id: 'IC_a',
          createdAt: '2026-10-20T09:00:00Z',
          body: 'loop-release: Red does not fail as planned\nsecond reason line\n\nloop-found: #31, #32 (each now blocks this task)\n\nBack in the queue: the next run can take it again.',
        },
        { id: 'IC_b', createdAt: '2026-10-20T10:00:00Z', body: 'loop-release: plain reason\n\nBack in the queue: the next run can take it again.' },
      ]),
    ]);
    const res = await signals();
    expect(res.body.comments).toEqual([
      { id: 'comment:12:IC_a', at: '2026-10-20T09:00:00.000Z', kind: 'comment', text: 'loop-release: Red does not fail as planned\nsecond reason line\nloop-found: #31, #32 (each now blocks this task)' },
      { id: 'comment:12:IC_b', at: '2026-10-20T10:00:00.000Z', kind: 'comment', text: 'loop-release: plain reason' },
    ]);
    expect(res.text).not.toContain('Back in the queue');
  });

  it('a loop-attempt comment, a comment out of the range and a comment of another kind give no item', async () => {
    writeWorld([
      issue(13, [
        { id: 'IC_1', createdAt: '2026-10-20T09:00:00Z', body: 'loop-attempt: 2' },
        { id: 'IC_2', createdAt: '2026-10-18T09:00:00Z', body: 'loop-release: before the range' },
        { id: 'IC_3', createdAt: '2026-10-22T09:00:00Z', body: 'loop-release: after the range' },
        { id: 'IC_4', createdAt: '2026-10-20T09:00:00Z', body: 'thanks, see loop-release: in the text' },
      ]),
    ]);
    const res = await signals();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ gate: [], comments: [] });
  });

  it('gives each item exactly id, at, kind and text, and the body holds no head commit, repository id, PR number, loop name or prompt', async () => {
    const loop = (
      await server.app.inject({
        method: 'POST',
        url: '/api/loops',
        payload: loopBody({ name: 'secret-loop-name-xyz', prompt: 'secret-prompt-text-xyz' }),
      })
    ).json();
    await endJob('failed', '2026-10-20T10:00:00Z', 'green', 'FAIL a test');
    writeWorld([issue(14, [{ id: 'IC_k', createdAt: '2026-10-20T09:00:00Z', body: 'loop-release: a reason' }])]);
    const res = await signals();
    expect(Object.keys(res.body)).toEqual(['gate', 'comments']);
    const items: Json[] = [...res.body.gate, ...res.body.comments];
    expect(items).toHaveLength(2);
    for (const item of items) expect(Object.keys(item).sort()).toEqual(['at', 'id', 'kind', 'text']);
    expect(items.map((i) => i.kind)).toEqual(['gate', 'comment']);
    for (const secret of [HEAD, repoId, String(PR_NUMBER), 'secret-loop-name-xyz', 'secret-prompt-text-xyz', loop.id as string, REPO]) {
      expect(res.text).not.toContain(secret);
    }
  });

  it('answers 502 GIT_HOST_FAILED when gh fails or cuts the list off, and never empty lists', async () => {
    await endJob('failed', '2026-10-20T10:00:00Z', 'green', 'FAIL a test');
    process.env.FAKE_GH_WORLD = join(tmpdir(), `lc-no-such-world-${randomUUID()}.json`);
    const broken = await signals();
    expect([broken.status, broken.body.error.code]).toEqual([502, 'GIT_HOST_FAILED']);
    expect(broken.body.gate).toBeUndefined();
    process.env.FAKE_GH_WORLD = gh.world;
    writeWorld(Array.from({ length: 1000 }, (_, i) => issue(i + 1, [])));
    const cut = await signals();
    expect([cut.status, cut.body.error.code]).toEqual([502, 'GIT_HOST_FAILED']);
  });

  it('answers 400 VALIDATION_FAILED for a bad repo, a missing or bad date, from not before to, and a range over 31 days', async () => {
    const bad = [
      await signals(FROM, TO, 'not a repo'),
      await signals(FROM, TO, 'a/b/c'),
      await signals(TO, FROM),
      await signals(FROM, FROM),
      await signals(FROM, '2026-11-25T00:00:00Z'),
      await signals('yesterday', TO),
      { ...(await server.app.inject({ method: 'GET', url: `/api/process/signals?from=${FROM}&to=${TO}` }).then((r) => ({ status: r.statusCode, body: r.json() as Json }))) },
    ];
    for (const res of bad) expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION_FAILED']);
  });
});
