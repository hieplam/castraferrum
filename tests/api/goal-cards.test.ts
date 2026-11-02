// The goal card service on the real wiring (spec 2.13, plan rules 1 to 4, goal rows G19, G20): a refused goal never starts, a one-way goal
// needs one yes, and by default every goal needs one yes. A real bare repository holds the charter, the fake `gh` holds the issues, and no
// ticker runs: the test winds the clock and calls one tick. The starter of this task does nothing, so `started` is the state of the row.
import { writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { composeServer, type ComposedServer } from '../../server/compose';
import { parseGoalCard } from '../../shared/domain/goal-card';
import { TEST_DB_URL, resetApi } from '../support/api-kit';
import { createBareRepo, type BareRepo } from '../support/bare-repo';
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh } from '../support/fake-gh-kit';

const SEC = 1000;
const HOUR = 3600 * SEC;
const DAY = 24 * HOUR;
/** More than the 60 s between two serves of one repository. */
const NEXT_TICK = 61 * SEC;
const WINDOW_ON = { refusalWindow: { enabled: true, hours: 8 }, acceptedWithNoChange: 3 };
const WINDOW_OFF = { refusalWindow: { enabled: false, hours: 8 }, acceptedWithNoChange: 3 };

type Row = { id: string; state: string; door: string; startAfter: string | null; changed: boolean; title: string; issueNumber: number; card: { title: string } };

let server: ComposedServer;
let gh: FakeGh;
let saved: string | undefined;
let bare: BareRepo;
let clone: string;
let repoId: string;

const charter = (over: Record<string, unknown> = {}) =>
  `${JSON.stringify({ v: 1, purpose: 'Test', mayStartAlone: [], neverAlone: ['force push'], refusalWindow: { enabled: false, hours: 8 }, acceptedWithNoChange: 0, ...over })}\n`;

function pushCharter(over: Record<string, unknown> = {}) {
  bare.commit(clone, { 'goals/charter.json': charter(over) }, 'charter');
  bare.push(clone, 'main');
}

const card = (over: Record<string, unknown> = {}) => ({
  v: 1,
  title: 'Faster probes',
  rows: [{ id: 'G1', outcome: 'The probe answers in 1 s', oracle: 'node check.mjs', threshold: 'ok' }],
  size: { planWindows: 0.5 },
  door: 'two-way',
  next: ['The cards page'],
  ...over,
});
const bodyOf = (value: unknown) => `The next goal.\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;

/** Opens one issue with the label `goal-card` in the fake world, and gives its number. */
function openCard(body: string): number {
  const world = gh.read();
  const number = Math.max(0, ...world.issues.map((i) => i.number)) + 1;
  const at = new Date().toISOString();
  world.issues.push({ number, title: `Goal card ${number}`, body, state: 'OPEN', labels: [{ name: 'goal-card' }], comments: [], url: `https://github.com/fake/repo/issues/${number}`, createdAt: at, updatedAt: at, closedAt: null });
  writeFileSync(gh.world, JSON.stringify(world));
  return number;
}

function editCard(number: number, body: string) {
  const world = gh.read();
  world.issues.find((i) => i.number === number)!.body = body;
  writeFileSync(gh.world, JSON.stringify(world));
}

const issue = (number: number) => gh.read().issues.find((i) => i.number === number)!;

async function registerRepo(gate: boolean): Promise<string> {
  const repo = await server.app.inject({ method: 'POST', url: '/api/repos', payload: { path: clone, name: 'cards' } });
  expect(repo.statusCode).toBe(201);
  const id = repo.json().id as string;
  if (gate) {
    const set = await server.app.inject({ method: 'POST', url: '/api/__test/repo-gate', payload: { repoId: id, enabled: false, githubRepo: 'fake/repo' } });
    expect(set.statusCode).toBe(204);
  }
  return id;
}

const wind = async (ms: number) => void (await server.app.inject({ method: 'POST', url: '/api/__test/clock', payload: { advanceMs: ms } }));
const setClock = async (at: Date) => void (await server.app.inject({ method: 'POST', url: '/api/__test/clock', payload: { at: at.toISOString() } }));

/** Winds past the 60 s of the service, then runs one tick. */
async function tickAfter(ms = NEXT_TICK) {
  await wind(ms);
  await server.inspect.backgroundTick();
}

async function list(): Promise<{ items: Row[]; acceptedWithNoChange: number }> {
  const res = await server.app.inject({ method: 'GET', url: `/api/goal-cards?repoId=${repoId}` });
  expect(res.statusCode).toBe(200);
  return res.json();
}
const row = async () => (await list()).items[0]!;
const post = (id: string, verb: 'accept' | 'refuse') => server.app.inject({ method: 'POST', url: `/api/goal-cards/${id}/${verb}` });
const notices = async () => (await server.app.inject({ method: 'GET', url: '/api/notices' })).json().items as { kind: string; dedupeKey: string; messageKey: string; params: { reason: string } }[];

beforeAll(async () => {
  gh = createFakeGh();
  saved = process.env.FAKE_GH_WORLD;
  process.env.FAKE_GH_WORLD = gh.world;
  server = await composeServer({ databaseUrl: TEST_DB_URL, testMode: true, dbWaitMs: 5000, ghBin: FAKE_GH_SCRIPT });
});

afterAll(async () => {
  await server?.shutdown();
  gh?.dispose();
  if (saved === undefined) delete process.env.FAKE_GH_WORLD;
  else process.env.FAKE_GH_WORLD = saved;
});

beforeEach(async () => {
  await resetApi(server);
  writeFileSync(gh.world, JSON.stringify({ issues: [], labels: ['goal-card'], prs: [], statuses: {}, checkRuns: {}, subIssues: {}, calls: [] }));
  bare = createBareRepo();
  clone = bare.clone();
});

afterEach(() => {
  bare.dispose();
});

describe('goal_cards', { timeout: 60_000 }, () => {
  it('a valid card gives 1 row and 1 notice, and a second tick gives no more', async () => {
    pushCharter();
    repoId = await registerRepo(true);
    const number = openCard(bodyOf(card()));
    expect(parseGoalCard(bodyOf(card())).ok).toBe(true);

    await tickAfter();
    await tickAfter();

    const { items } = await list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ state: 'proposed', door: 'two-way', title: 'Faster probes', issueNumber: number, startAfter: null, changed: false });
    const cardNotices = (await notices()).filter((n) => n.kind === 'goal_card');
    expect(cardNotices).toEqual([expect.objectContaining({ dedupeKey: `goal-card:${repoId}:${number}`, messageKey: 'notice.goalCard', params: { reason: 'Faster probes' } })]);
  });

  it('window on: a refused card stays refused past the window, and its issue is closed', async () => {
    pushCharter(WINDOW_ON);
    repoId = await registerRepo(true);
    const number = openCard(bodyOf(card()));
    await tickAfter();

    expect((await post((await row()).id, 'refuse')).statusCode).toBe(200);
    await tickAfter(9 * HOUR);

    expect((await row()).state).toBe('refused');
    expect(issue(number).state).toBe('CLOSED');
  });

  it('control: window on, a card that nobody refuses is started after the window', async () => {
    pushCharter(WINDOW_ON);
    repoId = await registerRepo(true);
    const number = openCard(bodyOf(card()));
    await tickAfter();
    expect((await row()).startAfter).not.toBeNull();

    await tickAfter(9 * HOUR);

    expect((await row()).state).toBe('started');
    expect(issue(number).state).toBe('CLOSED');
    expect(issue(number).comments.map((c) => c.body)).toEqual(['Started.']);
  });

  it('window on: one second before the end of the window the card stays proposed', async () => {
    pushCharter(WINDOW_ON);
    repoId = await registerRepo(true);
    openCard(bodyOf(card()));
    await tickAfter();

    await setClock(new Date(new Date((await row()).startAfter!).getTime() - SEC));
    await server.inspect.backgroundTick();

    expect((await row()).state).toBe('proposed');
  });

  it('a window that main turns off after the insert keeps the card proposed', async () => {
    pushCharter(WINDOW_ON);
    repoId = await registerRepo(true);
    openCard(bodyOf(card()));
    await tickAfter();

    pushCharter(WINDOW_OFF);
    await tickAfter(9 * HOUR);

    expect(await row()).toMatchObject({ state: 'proposed', startAfter: expect.any(String) });
  });

  it('window off by default: with no yes, a card stays proposed after 30 days', async () => {
    pushCharter();
    repoId = await registerRepo(true);
    const number = openCard(bodyOf(card()));
    await tickAfter();

    await tickAfter(30 * DAY);

    expect((await row()).state).toBe('proposed');
    expect(issue(number).state).toBe('OPEN');
  });

  it('accept is the one word that starts a card with the window off', async () => {
    pushCharter();
    repoId = await registerRepo(true);
    const number = openCard(bodyOf(card()));
    await tickAfter();

    const accepted = await post((await row()).id, 'accept');
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().state).toBe('accepted');
    await tickAfter();

    expect((await row()).state).toBe('started');
    expect(issue(number).state).toBe('CLOSED');
    expect((await list()).acceptedWithNoChange).toBe(1);
  });

  it('window on: a one-way card has no start time and stays proposed past the window', async () => {
    pushCharter(WINDOW_ON);
    repoId = await registerRepo(true);
    openCard(bodyOf(card({ door: 'one-way' })));
    await tickAfter();
    expect(await row()).toMatchObject({ door: 'one-way', startAfter: null });

    await tickAfter(30 * DAY);

    expect((await row()).state).toBe('proposed');
  });

  it('window on: one accept starts a one-way card', async () => {
    pushCharter(WINDOW_ON);
    repoId = await registerRepo(true);
    openCard(bodyOf(card({ door: 'one-way' })));
    await tickAfter();

    expect((await post((await row()).id, 'accept')).statusCode).toBe(200);
    await tickAfter();

    expect((await row()).state).toBe('started');
  });

  it('a two-way card that names a neverAlone entry is stored one-way, so the window cannot start it', async () => {
    pushCharter(WINDOW_ON);
    repoId = await registerRepo(true);
    openCard(bodyOf(card({ title: 'Clean main with a Force Push' })));
    await tickAfter();
    expect(await row()).toMatchObject({ door: 'one-way', startAfter: null });

    await tickAfter(9 * HOUR);

    expect((await row()).state).toBe('proposed');
  });

  it('a count of 2 keeps the window off, so nothing starts', async () => {
    pushCharter({ refusalWindow: { enabled: true, hours: 8 }, acceptedWithNoChange: 2 });
    repoId = await registerRepo(true);
    openCard(bodyOf(card()));
    await tickAfter();
    expect((await row()).startAfter).toBeNull();

    await tickAfter(9 * HOUR);

    expect((await row()).state).toBe('proposed');
  });

  it('a bad card is commented on and closed, and gives 0 rows', async () => {
    pushCharter();
    repoId = await registerRepo(true);
    const number = openCard('There is no block in this body.');

    await tickAfter();

    expect((await list()).items).toEqual([]);
    expect(issue(number).state).toBe('CLOSED');
    expect(issue(number).comments.map((c) => c.body)).toEqual(['Goal card refused: the body has 0 fenced json blocks, it must have 1']);
  });

  it('a second card while one is proposed is closed, and the first row stays alone', async () => {
    pushCharter();
    repoId = await registerRepo(true);
    const first = openCard(bodyOf(card()));
    const second = openCard(bodyOf(card({ title: 'Another goal' })));

    await tickAfter();

    expect((await list()).items.map((r) => r.issueNumber)).toEqual([first]);
    expect(issue(first).state).toBe('OPEN');
    expect(issue(second).state).toBe('CLOSED');
    expect(issue(second).comments[0]?.body).toMatch(/^Goal card refused: /);
  });

  it('a repository with no repo_gate row gets 0 gh calls and 0 rows', async () => {
    pushCharter();
    repoId = await registerRepo(false);
    openCard(bodyOf(card()));

    await tickAfter();

    expect(gh.read().calls).toEqual([]);
    expect((await list()).items).toEqual([]);
  });

  it('a main with no charter gets 0 gh calls and 0 rows', async () => {
    repoId = await registerRepo(true);
    openCard(bodyOf(card()));

    await tickAfter();

    expect(gh.read().calls).toEqual([]);
    expect((await list()).items).toEqual([]);
  });

  it('accept reads the issue again: an edited card is stored and sets changed, so it does not raise the count', async () => {
    pushCharter();
    repoId = await registerRepo(true);
    const number = openCard(bodyOf(card()));
    await tickAfter();

    editCard(number, bodyOf(card({ title: 'A better goal' })));
    const accepted = await post((await row()).id, 'accept');

    expect(accepted.json()).toMatchObject({ state: 'accepted', changed: true, title: 'A better goal', card: { title: 'A better goal' } });
    expect((await list()).acceptedWithNoChange).toBe(0);
  });

  it('an unknown card gives 404, and a decided card gives 409', async () => {
    pushCharter();
    repoId = await registerRepo(true);
    openCard(bodyOf(card()));
    await tickAfter();
    const { id } = await row();

    const unknown = await post('00000000-0000-4000-8000-000000000000', 'accept');
    const notAnId = await post('nope', 'refuse');
    expect((await post(id, 'accept')).statusCode).toBe(200);
    const again = await post(id, 'accept');
    const refused = await post(id, 'refuse');

    expect([unknown.statusCode, unknown.json().error.code]).toEqual([404, 'GOAL_CARD_NOT_FOUND']);
    expect([notAnId.statusCode, notAnId.json().error.code]).toEqual([404, 'GOAL_CARD_NOT_FOUND']);
    expect([again.statusCode, again.json().error.code]).toEqual([409, 'GOAL_CARD_NOT_OPEN']);
    expect([refused.statusCode, refused.json().error.code]).toEqual([409, 'GOAL_CARD_NOT_OPEN']);
  });
});
