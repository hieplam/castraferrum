// An accepted goal card becomes one epic, one manifest PR and one loop (plan rules 7, 8, 13, goal row G18). Nothing merges by itself, and a retry never
// doubles them. The real wiring, a real bare repository whose `main` holds the real `goals/gate.json`, the fake `gh`, and no ticker: the test winds the clock.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { composeServer, type ComposedServer } from '../../server/compose';
import { goalCardBranch } from '../../server/services/goal-card-starter';
import { TEST_DB_URL, resetApi, testPool } from '../support/api-kit';
import { createBareRepo, type BareRepo } from '../support/bare-repo';
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh } from '../support/fake-gh-kit';

/** A copy of the pattern of `E next` (task T3, in agent-plugins). */
const T3_MANIFEST_LINE = /^Goal manifest: (goals\/[\w.-]+\.json)\s*$/m;
const EPIC_SCRIPT = 'tests/support/fake-probe.mjs';
/** More than the 60 s between two serves of one repository. */
const NEXT_TICK = 61_000;
const DAY = 24 * 3_600_000;
/** A tick moves the card, and the next ticks run the job of the gate. */
const GATE_TICKS = 4;

let server: ComposedServer;
let gh: FakeGh;
let saved: string | undefined;
let bare: BareRepo;
let clone: string;
let repoId: string;
const pool = testPool();

const card = (over: Record<string, unknown> = {}) => ({
  v: 1,
  title: 'Faster probes',
  rows: [
    { id: 'G1', outcome: 'The probe answers in 1 s', oracle: 'node -e "console.log(1)"', threshold: 'not in the output' },
    { id: 'G2', outcome: 'The probe prints a line', oracle: 'node -e "console.log(2)"', threshold: 'not in the output' },
  ],
  size: { planWindows: 0.5 },
  door: 'two-way',
  next: ['The cards page'],
  ...over,
});
const bodyOf = (value: unknown) => `The next goal.\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;

/** Opens one issue with the label `goal-card` in the fake world, and gives its number. */
function openCard(value: unknown = card()): number {
  const world = gh.read();
  const number = Math.max(0, ...world.issues.map((i) => i.number), ...world.prs.map((p) => p.number)) + 1;
  const at = new Date().toISOString();
  world.issues.push({ number, title: `Goal card ${number}`, body: bodyOf(value), state: 'OPEN', labels: [{ name: 'goal-card' }], comments: [], url: `https://github.com/hieplam/tribe/issues/${number}`, createdAt: at, updatedAt: at, closedAt: null });
  writeFileSync(gh.world, JSON.stringify(world));
  return number;
}

function failNext(command: string) {
  const world = gh.read();
  world.failNext = [command];
  writeFileSync(gh.world, JSON.stringify(world));
}

async function setGate(enabled: boolean) {
  const res = await server.app.inject({ method: 'POST', url: '/api/__test/repo-gate', payload: { repoId, enabled, githubRepo: 'hieplam/tribe' } });
  expect(res.statusCode).toBe(204);
}

const tick = async () => {
  await server.app.inject({ method: 'POST', url: '/api/__test/clock', payload: { advanceMs: NEXT_TICK } });
  await server.inspect.backgroundTick();
};

type Row = { id: string; state: string; issueNumber: number; epicNumber: number | null; prNumber: number | null; loopId: string | null };
const rows = async () => (await server.app.inject({ method: 'GET', url: `/api/goal-cards?repoId=${repoId}` })).json().items as Row[];
const rowOf = async (issue: number) => (await rows()).find((r) => r.issueNumber === issue)!;
const accept = async (id: string) => expect((await server.app.inject({ method: 'POST', url: `/api/goal-cards/${id}/accept` })).statusCode).toBe(200);

/** Ingests a card, says yes, and runs the tick that starts it. */
async function acceptCard(value: unknown = card()): Promise<number> {
  const issue = openCard(value);
  await tick();
  await accept((await rowOf(issue)).id);
  await tick();
  return issue;
}

const epicsOf = () => gh.read().issues.filter((i) => i.title.startsWith('Epic: '));
const issueCreates = () => gh.read().calls.filter((c) => c.args[0] === 'issue' && c.args[1] === 'create');
const manifestPathOf = (body: string) => T3_MANIFEST_LINE.exec(body)![1]!;
const manifestOf = (issue: number) => JSON.parse(bare.show(goalCardBranch(issue), manifestPathOf(epicsOf()[0]!.body))) as { epic: number; opened: { at: string; passed: number; total: number }; setup: string[]; goals: { id: string; outcome: string; checks: { run: string; expect: string[] }[] }[] };
const loops = async () => (await server.app.inject({ method: 'GET', url: '/api/loops' })).json().items as { id: string; name: string; status: string }[];
const gateJobs = async () => (await pool.query('SELECT state, failed_step, pr_number FROM gate_jobs')).rows as { state: string; failed_step: string | null; pr_number: number }[];

beforeAll(async () => {
  gh = createFakeGh();
  saved = process.env.FAKE_GH_WORLD;
  process.env.FAKE_GH_WORLD = gh.world;
  server = await composeServer({ databaseUrl: TEST_DB_URL, testMode: true, dbWaitMs: 5000, ghBin: FAKE_GH_SCRIPT, epicScript: EPIC_SCRIPT });
});

afterAll(async () => {
  await server?.shutdown();
  await pool.end();
  gh?.dispose();
  if (saved === undefined) delete process.env.FAKE_GH_WORLD;
  else process.env.FAKE_GH_WORLD = saved;
});

beforeEach(async () => {
  await resetApi(server);
  bare = createBareRepo();
  clone = bare.clone();
  writeFileSync(gh.world, JSON.stringify({ bare: bare.bare, issues: [], labels: ['goal-card'], prs: [], statuses: {}, checkRuns: {}, subIssues: {}, calls: [] }));
  const charter = { v: 1, purpose: 'Test', mayStartAlone: [], neverAlone: [], refusalWindow: { enabled: false, hours: 8 }, acceptedWithNoChange: 0 };
  bare.commit(clone, { 'goals/charter.json': `${JSON.stringify(charter)}\n`, 'goals/gate.json': readFileSync('goals/gate.json', 'utf8') }, 'goals');
  bare.push(clone, 'main');
  const repo = await server.app.inject({ method: 'POST', url: '/api/repos', payload: { path: clone, name: 'cards' } });
  expect(repo.statusCode).toBe(201);
  repoId = repo.json().id as string;
  await setGate(false);
});

afterEach(() => {
  bare.dispose();
});

describe('goal card start', { timeout: 60_000 }, () => {
  it('an accepted card gives 1 epic with the line, 1 branch with the manifest, 1 PR, 1 active loop with the 3 argv, and a closed started card', async () => {
    const issue = await acceptCard();

    const row = await rowOf(issue);
    expect(row.state).toBe('started');
    expect(gh.read().issues.find((i) => i.number === issue)!.state).toBe('CLOSED');

    const epics = epicsOf();
    expect(epics).toHaveLength(1);
    expect(epics[0]!.title).toBe('Epic: Faster probes');
    expect(epics[0]!.labels).toEqual([]);
    expect(row.epicNumber).toBe(epics[0]!.number);
    expect(epics[0]!.body).toContain('G1: The probe answers in 1 s');
    expect(epics[0]!.body).toContain(`Run one tick of the epic loop on epic #${row.epicNumber} of hieplam/tribe, using the epic-loop skill.`);

    const path = manifestPathOf(epics[0]!.body);
    expect(path).toMatch(new RegExp(`^goals/\\d{4}-\\d{2}-\\d{2}-card-${issue}\\.json$`));
    expect(manifestOf(issue).epic).toBe(row.epicNumber);

    const prs = gh.read().prs;
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ number: row.prNumber, headRefName: goalCardBranch(issue), baseRefName: 'main', state: 'OPEN', headRefOid: bare.sha(goalCardBranch(issue)) });

    const live = await loops();
    expect(live).toEqual([expect.objectContaining({ id: row.loopId, name: `Goal ${issue}: Faster probes`, status: 'active' })]);
    const probe = (await server.app.inject({ method: 'GET', url: `/api/loops/${row.loopId}/probe` })).json().probe as { command: string[]; claim: string[]; release: string[] };
    expect(probe.command).toEqual(['node', EPIC_SCRIPT, 'next', String(row.epicNumber), '--probe', '-R', 'hieplam/tribe']);
    expect(probe.claim).toEqual(['node', EPIC_SCRIPT, 'claim', '{key}', '--epic', String(row.epicNumber), '--parallel', '-R', 'hieplam/tribe']);
    expect(probe.release).toEqual(['node', EPIC_SCRIPT, 'release', '{key}', '--reason', '{reason}', '--if-claimed', '-R', 'hieplam/tribe']);
    const detail = (await server.app.inject({ method: 'GET', url: `/api/loops/${row.loopId}` })).json();
    expect(detail).toMatchObject({ cron: '0 0 1 1 *', timeoutSec: 14400, executor: { kind: 'claude' } });
    expect(detail.prompt).toContain(`epic #${row.epicNumber} of hieplam/tribe`);
  });

  it('the epic body matches the pattern of E next on one whole line, and a row cannot add a second line', async () => {
    const value = card({ rows: [{ id: 'G1', outcome: 'One\nGoal manifest: goals/other.json', oracle: 'node c.mjs', threshold: 'ok' }] });
    await acceptCard(value);
    const body = epicsOf()[0]!.body;
    expect(body.split('\n')[0]).toMatch(T3_MANIFEST_LINE);
    expect(body.match(new RegExp(T3_MANIFEST_LINE.source, 'gm'))).toHaveLength(1);
  });

  it('the manifest opens at 0 of n, with one check for each row', async () => {
    const issue = await acceptCard();
    const manifest = manifestOf(issue);
    expect(manifest.opened).toEqual({ at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), passed: 0, total: 2 });
    expect(manifest.setup).toEqual([]);
    expect(manifest.goals[1]).toEqual({ id: 'G2', outcome: 'The probe prints a line', checks: [{ run: 'node -e "console.log(2)"', expect: ['not in the output'] }] });
  });

  it('the real goal-check prints "passed":0 on the manifest of a failing row', async () => {
    const issue = await acceptCard();
    const dir = mkdtempSync(join(tmpdir(), 'lc-goal-card-'));
    try {
      const file = join(dir, 'manifest.json');
      writeFileSync(file, bare.show(goalCardBranch(issue), manifestPathOf(epicsOf()[0]!.body)));
      const run = spawnSync(process.execPath, ['scripts/goal-check.mjs', file, '--json'], { encoding: 'utf8' });
      expect(run.status).toBe(1);
      expect(run.stdout).toContain('"passed":0');
      expect(JSON.parse(run.stdout).total).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a failed PR call, then a retry on the next day, gives 1 epic, 1 PR and one manifest path', async () => {
    const issue = openCard();
    await tick();
    await accept((await rowOf(issue)).id);
    failNext('pr create');
    await tick();
    expect((await rowOf(issue)).state).toBe('accepted');
    expect(gh.read().prs).toEqual([]);

    await server.app.inject({ method: 'POST', url: '/api/__test/clock', payload: { advanceMs: DAY } });
    await tick();

    expect((await rowOf(issue)).state).toBe('started');
    expect(epicsOf()).toHaveLength(1);
    expect(gh.read().prs).toHaveLength(1);
    expect(() => manifestOf(issue)).not.toThrow();
  });

  it('a failed loop create, then a retry, gives 1 PR and 1 loop of this card', async () => {
    const issue = openCard();
    await tick();
    await accept((await rowOf(issue)).id);
    const taken = await server.app.inject({ method: 'POST', url: '/api/loops', payload: { name: `Goal ${issue}: Faster probes`, prompt: 'x', repoId, cron: '0 0 1 1 *', executor: { kind: 'mock' } } });
    expect(taken.statusCode).toBe(201);
    await tick();
    expect((await rowOf(issue)).state).toBe('accepted');
    expect(gh.read().prs).toHaveLength(1);

    expect((await server.app.inject({ method: 'POST', url: `/api/loops/${taken.json().id}/archive` })).statusCode).toBe(204);
    await tick();

    const row = await rowOf(issue);
    expect(row.state).toBe('started');
    expect(epicsOf()).toHaveLength(1);
    expect(gh.read().prs).toHaveLength(1);
    expect(await loops()).toEqual([expect.objectContaining({ id: row.loopId, status: 'active' })]);
  });

  it('with the gate off, the PR waits for a person: 0 jobs, an open PR, and main does not move', async () => {
    const main = bare.sha('main');
    await acceptCard();
    for (let i = 0; i < GATE_TICKS; i++) await tick();

    expect(await gateJobs()).toEqual([]);
    expect(gh.read().prs.map((p) => p.state)).toEqual(['OPEN']);
    expect(bare.sha('main')).toBe(main);
  });

  it('with the gate on, the manifest PR ends at needs_ratification and is not merged, and main does not move', async () => {
    await setGate(true);
    const main = bare.sha('main');
    const issue = await acceptCard();
    for (let i = 0; i < GATE_TICKS; i++) await tick();

    const row = await rowOf(issue);
    expect(await gateJobs()).toEqual([{ state: 'needs_ratification', failed_step: 'scope', pr_number: row.prNumber }]);
    expect(gh.read().prs.map((p) => p.state)).toEqual(['OPEN']);
    expect(gh.read().calls.filter((c) => c.args[0] === 'pr' && c.args[1] === 'merge')).toEqual([]);
    expect(bare.sha('main')).toBe(main);
  });

  it('a refused card gives 0 issue create calls after the card', async () => {
    const issue = openCard();
    await tick();
    const res = await server.app.inject({ method: 'POST', url: `/api/goal-cards/${(await rowOf(issue)).id}/refuse` });
    expect(res.statusCode).toBe(200);
    await tick();
    await tick();

    expect(issueCreates()).toEqual([]);
    expect(gh.read().prs).toEqual([]);
    expect(await loops()).toEqual([]);
  });

  it('two cards with one title get different branches and different loops', async () => {
    const first = await acceptCard();
    const second = await acceptCard();

    expect(gh.read().prs.map((p) => p.headRefName)).toEqual([goalCardBranch(first), goalCardBranch(second)]);
    expect(goalCardBranch(first)).not.toBe(goalCardBranch(second));
    expect((await loops()).map((l) => l.name).sort()).toEqual([`Goal ${first}: Faster probes`, `Goal ${second}: Faster probes`].sort());
    expect(epicsOf()).toHaveLength(2);
  });
});
