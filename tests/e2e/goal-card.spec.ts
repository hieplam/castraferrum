// E2E UC-39 (goal G18, task W6 of epic 217): when a goal ends, the next goal card appears with no owner message.
// All real except the model and GitHub: a second server process (the shared e2e server has no fake `gh`), real Postgres, the real probe
// `scripts/goal-writer-probe.mjs`, real git (a local bare repository and a clone of it), the fake `gh` (tests/support/fake-gh.mjs) and the
// fake Claude session of test mode. The clone folder is named `lc-fake-claude-card-*`, so the loop runs no process and costs nothing.
// The prompt `[goal-card]` makes the fake session open the card of `card.md` as an issue, as the goal writer does.
// The clock is wound with `POST /api/__test/clock`, so no test waits for a real minute.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { FAKE_CLAUDE_DIR_PREFIX } from '../../server/adapters/executors/claude/test-mode-query';
import { createBareRepo, type BareRepo } from '../support/bare-repo';
import { createFakeGh, type FakeGh, type FakeWorld } from '../support/fake-gh-kit';
import { ServerProcess } from '../support/server-process';

const PROBE = resolve('scripts/goal-writer-probe.mjs');
const REPO = 'hieplam/tribe';
const CHARTER = readFileSync(resolve('goals/charter.json'), 'utf8');
const WRITER_PROMPT = `[goal-card] Run the goal writer on ${REPO}, using the epic-loop skill.`;
const CARD = {
  v: 1,
  title: 'The same report for each customer',
  rows: [{ id: 'R1', outcome: 'Each customer gets the report', oracle: 'node scripts/report.mjs --all', threshold: 'customers: 3/3' }],
  size: { planWindows: 0.5 },
  door: 'two-way',
  next: ['Send the report by mail'],
};
const CARD_BODY = `A goal card.\n\n\`\`\`json\n${JSON.stringify(CARD, null, 2)}\n\`\`\`\n`;
const EPIC = { title: 'Epic: Billing report', body: 'Epic body.\n\nGoal manifest: goals/2026-11-01-billing.json\n' };

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let bare: BareRepo;
let bareNoCharter: BareRepo;
let gh: FakeGh;
let sp: ServerProcess;

test.beforeAll(async () => {
  bare = createBareRepo();
  const seed = bare.clone();
  bare.commit(seed, { 'goals/charter.json': CHARTER }, 'charter');
  bare.push(seed, 'main');
  bareNoCharter = createBareRepo();
  gh = createFakeGh(bare);
  gh.seedLabels('goal-card');
  // The script itself, not the `.cmd` wrapper: the console runs `gh` with no shell, and Node cannot spawn a `.cmd` that way on Windows.
  sp = await ServerProcess.launch({ env: { LOOPS_GH_BIN: gh.script, FAKE_GH_WORLD: gh.world } });
});

test.afterAll(async () => {
  await sp?.stop();
  gh?.dispose();
  bare?.dispose();
  bareNoCharter?.dispose();
});

/** Edits the world of the fake `gh`, the way the outside world changes it. */
function changeWorld(change: (w: FakeWorld) => void): void {
  const w = gh.read();
  change(w);
  writeFileSync(gh.world, JSON.stringify(w, null, 2));
}

function seedEpic(): void {
  changeWorld((w) => {
    const at = '2026-11-01T00:00:00Z';
    w.issues = [{ number: 1, title: EPIC.title, body: EPIC.body, state: 'OPEN', labels: [], comments: [], author: { login: 'hieplam' }, url: 'https://github.com/hieplam/tribe/issues/1', createdAt: at, updatedAt: at, closedAt: null }];
    w.calls = [];
  });
}

function closeEpic(): void {
  changeWorld((w) => {
    const epic = w.issues.find((i) => i.number === 1)!;
    epic.state = 'CLOSED';
    epic.closedAt = '2026-11-02T00:00:00Z';
  });
}

/** A clone of `origin` in a folder named for the fake session. It holds `card.md`, the card that the fake writer opens. */
function cloneOf(origin: BareRepo): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `${FAKE_CLAUDE_DIR_PREFIX}card-`)));
  execFileSync('git', ['clone', '-q', origin.bare, dir], { stdio: 'ignore' });
  writeFileSync(join(dir, 'card.md'), CARD_BODY);
  return dir;
}

/** The loop of the goal writer, started. `origin` decides whether the repository has a charter on `origin/main`. */
async function startWriter(origin: BareRepo): Promise<string> {
  expect((await sp.api('POST', '/api/__test/reset')).status).toBe(204);
  expect((await sp.api('POST', '/api/__test/clock', { at: '2026-11-02T03:00:00Z' })).status).toBe(200);
  seedEpic();
  const repo = await sp.api<Json>('POST', '/api/repos', { path: cloneOf(origin), name: 'tribe' });
  expect(repo.status).toBe(201);
  const repoId = repo.body.id as string;
  expect((await sp.api('POST', '/api/__test/repo-gate', { repoId, enabled: false, githubRepo: REPO })).status).toBe(204);
  const created = await sp.api<Json>('POST', '/api/loops', {
    name: 'Goal writer',
    description: 'Writes the next goal card',
    prompt: WRITER_PROMPT,
    repoId,
    cron: '0 0 1 1 *',
    timezone: 'Asia/Ho_Chi_Minh',
    timeoutSec: 600,
    executor: { kind: 'claude', config: { model: 'haiku', effort: 'low' } },
  });
  expect(created.status).toBe(201);
  const loopId = created.body.id as string;
  expect((await sp.api('PUT', `/api/loops/${loopId}/probe`, { command: [process.execPath, PROBE, '-R', REPO] })).status).toBe(200);
  expect((await sp.api('POST', `/api/loops/${loopId}/start`)).status).toBe(200);
  return loopId;
}

/** Winds the clock of the console on by 61 s, so the next tick calls the probe and serves the goal cards. */
async function wind(): Promise<void> {
  expect((await sp.api('POST', '/api/__test/clock', { advanceMs: 61_000 })).status).toBe(200);
}

const runsOf = async (loopId: string): Promise<number> => ((await sp.api<Json>('GET', `/api/loops/${loopId}/runs`)).body.items as unknown[]).length;
const probeOf = async (loopId: string): Promise<Json> => (await sp.api<Json>('GET', `/api/loops/${loopId}/probe`)).body.probe as Json;
const cardsOf = async (): Promise<Json[]> => (await sp.api<Json>('GET', '/api/goal-cards')).body.items as Json[];
const noticesOf = async (): Promise<Json[]> => (await sp.api<Json>('GET', '/api/notices')).body.items as Json[];

/** Winds the clock on, then waits until the console has called the probe again (its `lastProbeAt` moves). */
async function windAndWaitForProbe(loopId: string): Promise<void> {
  const before = (await probeOf(loopId)).lastProbeAt;
  await wind();
  await expect.poll(async () => (await probeOf(loopId)).lastProbeAt, { timeout: 15_000 }).not.toBe(before);
}

/** Waits until the first probe call has a result, so a later "0 runs" is not just "the probe did not run yet". */
async function firstProbeLine(loopId: string, action: string): Promise<void> {
  await expect.poll(async () => (await probeOf(loopId)).lastLine ?? '', { timeout: 15_000 }).toContain(`"action":"${action}"`);
}

test('UC-39: when a goal ends, the next goal card appears with no owner message', { tag: '@UC-39' }, async () => {
  test.setTimeout(120_000);
  const loopId = await startWriter(bare);
  await firstProbeLine(loopId, 'skip'); // the epic is open: the goal runs
  expect(await runsOf(loopId)).toBe(0);
  expect(await cardsOf()).toHaveLength(0);

  closeEpic(); // the goal ends
  await expect
    .poll(
      async () => {
        await wind();
        return [await runsOf(loopId), (await cardsOf()).length];
      },
      { timeout: 15_000, intervals: [500] },
    )
    .toEqual([1, 1]);

  const [card] = await cardsOf();
  expect(card).toMatchObject({ state: 'proposed', door: 'two-way', githubRepo: REPO, title: CARD.title });
  const notices = await noticesOf();
  expect(notices.filter((n) => n.kind === 'goal_card')).toHaveLength(1);
  expect(notices.find((n) => n.kind === 'goal_card')).toMatchObject({ dedupeKey: `goal-card:${card!.repoId}:${card!.issueNumber}`, messageKey: 'notice.goalCard' });
  // The writer made one card issue, and nobody else wrote to GitHub.
  expect(gh.read().issues.filter((i) => i.labels.some((l) => l.name === 'goal-card'))).toHaveLength(1);
});

test('UC-39: a goal that stays open gives no card', { tag: '@UC-39' }, async () => {
  test.setTimeout(120_000);
  const loopId = await startWriter(bare);
  await firstProbeLine(loopId, 'skip');
  await windAndWaitForProbe(loopId);
  await windAndWaitForProbe(loopId);
  // Two more probe calls have had their turn: the open goal still holds the writer back.
  expect((await probeOf(loopId)).lastLine).toContain('"action":"skip"');
  expect(await runsOf(loopId)).toBe(0);
  expect(await cardsOf()).toHaveLength(0);
  expect(await noticesOf()).toHaveLength(0);
});

test('UC-39: a repository with no charter gives no card', { tag: '@UC-39' }, async () => {
  test.setTimeout(120_000);
  const loopId = await startWriter(bareNoCharter);
  closeEpic(); // even with no goal running, the writer has no charter to follow
  await firstProbeLine(loopId, 'blocked');
  await windAndWaitForProbe(loopId);
  await windAndWaitForProbe(loopId);
  expect((await probeOf(loopId)).state).toBe('blocked');
  expect(await runsOf(loopId)).toBe(0);
  expect(await cardsOf()).toHaveLength(0);
});
