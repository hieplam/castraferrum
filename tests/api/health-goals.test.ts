// Health goals (goals G13 and G6): the H2 row of the real goals/health.json runs the real merge audit on the fake gh.
// A merge with no gate status gives one issue, a repeat gives no second one, and a broken gh call never reads as a pass.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GhGitHost } from '../../server/adapters/github/gh-git-host';
import { RandomIdGenerator } from '../../server/adapters/ids/random-id-generator';
import { openDb, truncateAll, type Db } from '../../server/adapters/postgres/db';
import { createPgRepositories } from '../../server/adapters/postgres/repositories';
import { NodeCommandRunner } from '../../server/adapters/process/node-command-runner';
import type { CommandRequest, CommandResult, CommandRunner } from '../../server/ports/command-runner';
import type { GoalRepository } from '../../server/ports/goal-repository';
import { DefaultStandingGoalService } from '../../server/services/standing-goal-service';
import { TEST_DB_URL } from '../support/api-kit';
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh, type FakePr } from '../support/fake-gh-kit';

const REPO = 'fake/repo';
const ROOT = process.cwd();
const T1 = new Date('2026-11-02T02:00:00.000Z');
const T2 = new Date('2026-11-03T02:00:00.000Z');
const HEALTH = readFileSync(new URL('../../goals/health.json', import.meta.url), 'utf8');
/** The real file without its H1 row (the full verify): a test must not start a real verify. H2 is the real row. */
const parsed = JSON.parse(HEALTH) as { rows: { id: string }[] };
const AUDIT_ONLY = JSON.stringify({ ...parsed, rows: parsed.rows.filter((r) => r.id === 'H2') });

const sha = (n: number) => `${n.toString(16).padStart(2, '0')}abcdef1234567890abcdef1234567890abcdef`;

class CountingRunner implements CommandRunner {
  calls = 0;
  readonly #inner = new NodeCommandRunner();
  run(req: CommandRequest): Promise<CommandResult> {
    this.calls++;
    return this.#inner.run(req);
  }
}

let db: Db;
let goals: GoalRepository;
let gh: FakeGh;
let runner: CountingRunner;
let service: DefaultStandingGoalService;
const saved: Record<string, string | undefined> = {};

beforeAll(async () => {
  db = await openDb(TEST_DB_URL);
  goals = createPgRepositories(db.pool).goals;
});
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await truncateAll(db.pool);
  gh = createFakeGh();
  for (const k of ['FAKE_GH_WORLD', 'LOOPS_GH_BIN']) saved[k] = process.env[k];
  process.env.FAKE_GH_WORLD = gh.world;
  process.env.LOOPS_GH_BIN = FAKE_GH_SCRIPT;
  runner = new CountingRunner();
  service = new DefaultStandingGoalService({
    goals,
    git: new GhGitHost({ runner: new NodeCommandRunner(), ghBin: FAKE_GH_SCRIPT }),
    runner,
    ids: new RandomIdGenerator(),
  });
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  gh.dispose();
});

function merged(number: number, mergedAt: string, status?: string): void {
  const w = gh.read();
  const pr: FakePr = {
    number,
    title: `PR ${number}`,
    body: '',
    state: 'MERGED',
    headRefName: `b${number}`,
    baseRefName: 'main',
    headRefOid: sha(number),
    mergeCommit: null,
    url: `https://github.com/${REPO}/pull/${number}`,
    createdAt: '2026-10-01T00:00:00.000Z',
    mergedAt,
  };
  w.prs.push(pr);
  if (status) w.statuses[sha(number)] = [{ state: status, context: 'castraferrum/gate', description: 'verify', created_at: mergedAt }];
  writeFileSync(gh.world, JSON.stringify(w));
}

const health = (now: Date) => service.runHealth({ repo: REPO, cwd: ROOT, text: AUDIT_ONLY, now });
const issues = () => gh.read().issues;
const AFTER = '2026-11-02T00:00:00.000Z';

describe('health goals, row H2 (G13, G6)', { timeout: 120_000 }, () => {
  it('a merge with no gate status gives one issue that names the PR', async () => {
    merged(1, AFTER, 'success');
    merged(2, AFTER);
    expect(await health(T1)).toEqual({ opened: 1, updated: 0, closed: 0, deferred: 0 });
    expect(issues()).toHaveLength(1);
    const issue = issues()[0]!;
    expect(issue.title).toMatch(/^standing goal H2: /);
    expect(issue.body).toMatch(/^<!-- fingerprint:[0-9a-f]{12} -->\n/);
    expect(issue.body).toContain('PR 2');
  });

  it('a repeat on the next day gives no second issue', async () => {
    merged(2, AFTER);
    await health(T1);
    expect(await health(T2)).toEqual({ opened: 0, updated: 1, closed: 0, deferred: 0 });
    expect(issues()).toHaveLength(1);
    expect(issues()[0]!.body).toContain('Failed passes: 2');
  });

  it('a broken gh call gives one issue and closes nothing', async () => {
    process.env.LOOPS_GH_BIN = 'definitely-not-a-program.mjs';
    expect(await health(T1)).toMatchObject({ opened: 1, closed: 0 });
    expect(issues()).toHaveLength(1);
    expect(issues()[0]!.state).toBe('OPEN');
  });

  it('a broken gh call keeps an open incident issue open', async () => {
    merged(2, AFTER);
    await health(T1);
    process.env.LOOPS_GH_BIN = 'definitely-not-a-program.mjs';
    expect(await health(T2)).toMatchObject({ closed: 0 });
    // The broken call is another failure, so it can open its own issue. The incident issue stays open.
    const incident = issues()[0]!;
    expect(incident.body).toContain('PR 2');
    expect(incident.state).toBe('OPEN');
  });

  it('a pass, with every merge on a status, closes the open issue', async () => {
    merged(2, AFTER);
    await health(T1);
    const w = gh.read();
    w.statuses[sha(2)] = [{ state: 'success', context: 'castraferrum/gate', description: 'verify', created_at: AFTER }];
    writeFileSync(gh.world, JSON.stringify(w));
    expect(await health(T2)).toEqual({ opened: 0, updated: 0, closed: 1, deferred: 0 });
    expect(issues()[0]!.state).toBe('CLOSED');
  });

  it('a merge before --since gives no issue', async () => {
    merged(3, '2026-10-15T00:00:00.000Z');
    expect(await health(T1)).toEqual({ opened: 0, updated: 0, closed: 0, deferred: 0 });
    expect(issues()).toHaveLength(0);
  });

  it('a second call on the same day returns null and runs no command', async () => {
    merged(2, AFTER);
    await health(T1);
    const calls = runner.calls;
    expect(await health(new Date(T1.getTime() + 3_600_000))).toBeNull();
    expect(runner.calls).toBe(calls);
    expect(issues()).toHaveLength(1);
  });

  it('nothing in compose.ts, main.ts or server/scheduler/ reaches health.json or runHealth', () => {
    const root = new URL('../../', import.meta.url);
    const dir = new URL('server/scheduler/', root);
    const sources = ['server/compose.ts', 'server/main.ts'].map((f) => readFileSync(new URL(f, root), 'utf8'));
    for (const name of readdirSync(dir)) sources.push(readFileSync(new URL(name, dir), 'utf8'));
    for (const s of sources) {
      expect(s).not.toContain('health.json');
      expect(s).not.toContain('runHealth');
    }
  });
});
