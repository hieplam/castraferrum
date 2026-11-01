// Standing goals (goal G13): a regression gives one issue, a repeat updates it, a pass closes it, one pass opens at most 3.
// Real Postgres, GhGitHost on the fake gh (no network and no token), and a scripted runner in place of the health commands.
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
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh } from '../support/fake-gh-kit';

const REPO = 'fake/repo';
const CWD = '/repo/under/test';
const T1 = new Date('2026-11-01T02:00:00.000Z');
const T2 = new Date('2026-11-02T02:00:00.000Z');
const T3 = new Date('2026-11-03T02:00:00.000Z');

const failed = (stdout: string, stderr = ''): CommandResult => ({ exitCode: 1, stdout, stderr, timedOut: false, error: null });
const passed: CommandResult = { exitCode: 0, stdout: 'all good', stderr: '', timedOut: false, error: null };

/** Answers each row from `results`, by the first word of its command. */
class ScriptedRunner implements CommandRunner {
  readonly results = new Map<string, CommandResult>();
  readonly calls: CommandRequest[] = [];
  async run(req: CommandRequest): Promise<CommandResult> {
    this.calls.push(req);
    const r = this.results.get(req.argv[0]!);
    if (!r) throw new Error(`no scripted result for ${req.argv[0]}`);
    return r;
  }
}

const row = (id: string) => ({ id, outcome: `outcome of ${id}`, run: [id, '--check'], timeoutSec: 60 });
const rowIds = (n: number) => Array.from({ length: n }, (_, i) => `H${i + 1}`);

let db: Db;
let goals: GoalRepository;
let gh: FakeGh;
let runner: ScriptedRunner;
let service: DefaultStandingGoalService;
let saved: string | undefined;

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
  saved = process.env.FAKE_GH_WORLD;
  process.env.FAKE_GH_WORLD = gh.world;
  runner = new ScriptedRunner();
  service = new DefaultStandingGoalService({
    goals,
    git: new GhGitHost({ runner: new NodeCommandRunner(), ghBin: FAKE_GH_SCRIPT }),
    runner,
    ids: new RandomIdGenerator(),
  });
});
afterEach(() => {
  if (saved === undefined) delete process.env.FAKE_GH_WORLD;
  else process.env.FAKE_GH_WORLD = saved;
  gh.dispose();
});

const pass = (ids: string[], now: Date, maxNewIssues = 3) =>
  service.runPass({ repo: REPO, cwd: CWD, rows: ids.map(row), maxNewIssues, now });
const issues = () => gh.read().issues;

describe('standing goals (G13)', { timeout: 60_000 }, () => {
  it('two failing passes open one issue', async () => {
    runner.results.set('H1', failed('ok 1\nFAIL tests/a.test.ts > loads rows'));
    expect(await pass(['H1'], T1)).toEqual({ opened: 1, updated: 0, closed: 0, deferred: 0 });
    expect(await pass(['H1'], T2)).toEqual({ opened: 0, updated: 1, closed: 0, deferred: 0 });

    expect(issues()).toHaveLength(1);
    const issue = issues()[0]!;
    expect(issue.title).toBe('standing goal H1: outcome of H1');
    expect(issue.labels.map((l) => l.name)).toEqual(['standing-goal']);
    expect(issue.body).toMatch(/^<!-- fingerprint:[0-9a-f]{12} -->\n/);
    expect(issue.body).toContain('outcome of H1');
    expect(runner.calls[0]).toMatchObject({ argv: ['H1', '--check'], cwd: CWD, timeoutMs: 60_000 });
    expect(await goals.getGoal(REPO, 'H1')).toEqual({
      repo: REPO,
      rowId: 'H1',
      state: 'failing',
      lastLine: 'FAIL tests/a.test.ts > loads rows',
      lastRunAt: T2,
    });
  });

  it('the second failing pass updates the "Last failed" line and keeps the last 40 lines of the output', async () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i + 1}.`);
    runner.results.set('H1', failed(['FAIL a', ...lines].join('\n')));
    await pass(['H1'], T1);
    const first = issues()[0]!.body;
    expect(first).toContain(`Last failed: ${T1.toISOString()}`);
    expect(first).toContain('Failed passes: 1');

    await pass(['H1'], T2);
    const body = issues()[0]!.body;
    expect(body).toContain(`Last failed: ${T2.toISOString()}`);
    expect(body).not.toContain(T1.toISOString());
    expect(body).toContain('Failed passes: 2');
    expect(body.split('\n')[0]).toBe(first.split('\n')[0]);
    expect(body).toContain('line-11.');
    expect(body).not.toContain('line-10.');
  });

  it('a pass closes the issue, with a comment', async () => {
    runner.results.set('H1', failed('FAIL a'));
    await pass(['H1'], T1);
    runner.results.set('H1', passed);
    expect(await pass(['H1'], T2)).toEqual({ opened: 0, updated: 0, closed: 1, deferred: 0 });

    const issue = issues()[0]!;
    expect(issue.state).toBe('CLOSED');
    expect(issue.comments.map((c) => c.body)).toEqual([`Passed at ${T2.toISOString()}`]);
    expect(await goals.listOpen(REPO, 'H1')).toEqual([]);
    expect(await goals.getGoal(REPO, 'H1')).toMatchObject({ state: 'passing', lastRunAt: T2 });
  });

  it('a failure after a close opens a new issue and does not adopt the closed one', async () => {
    runner.results.set('H1', failed('FAIL a'));
    await pass(['H1'], T1);
    runner.results.set('H1', passed);
    await pass(['H1'], T2);
    runner.results.set('H1', failed('FAIL a'));
    expect(await pass(['H1'], T3)).toEqual({ opened: 1, updated: 0, closed: 0, deferred: 0 });
    expect(issues().map((i) => i.state)).toEqual(['CLOSED', 'OPEN']);
  });

  it('5 new failures open 3 issues and defer 2, and a deferred row stores nothing', async () => {
    const ids = rowIds(5);
    for (const id of ids) runner.results.set(id, failed('FAIL a'));
    expect(await pass(ids, T1)).toEqual({ opened: 3, updated: 0, closed: 0, deferred: 2 });
    expect(issues()).toHaveLength(3);
    expect(await goals.getGoal(REPO, 'H3')).not.toBeNull();
    expect(await goals.getGoal(REPO, 'H4')).toBeNull();
    expect(await goals.listOpen(REPO, 'H4')).toEqual([]);
  });

  it('the deferred rows open their issues in the next pass', async () => {
    const ids = rowIds(5);
    for (const id of ids) runner.results.set(id, failed('FAIL a'));
    await pass(ids, T1);
    expect(await pass(ids, T2)).toEqual({ opened: 2, updated: 3, closed: 0, deferred: 0 });
    expect(issues().map((i) => i.title)).toEqual(ids.map((id) => `standing goal ${id}: outcome of ${id}`));
  });

  it('the same line with other numbers, paths and times is the same issue', async () => {
    runner.results.set('H1', failed('FAIL tests/x.test.ts > loads 12 rows at 2026-11-01T10:00:00Z (abcdef1234)'));
    await pass(['H1'], T1);
    runner.results.set('H1', failed('', 'FAIL tests/y.test.ts > loads 99 rows at 2026-11-02 23:59:01 (0123456789ab)'));
    expect(await pass(['H1'], T2)).toEqual({ opened: 0, updated: 1, closed: 0, deferred: 0 });
    expect(issues()).toHaveLength(1);
  });

  it('a different line opens a second issue, and a pass closes both', async () => {
    runner.results.set('H1', failed('FAIL loads rows'));
    await pass(['H1'], T1);
    runner.results.set('H1', { exitCode: null, stdout: 'FAIL saves rows', stderr: '', timedOut: true, error: null });
    expect(await pass(['H1'], T2)).toEqual({ opened: 1, updated: 0, closed: 0, deferred: 0 });
    expect(issues()).toHaveLength(2);
    runner.results.set('H1', passed);
    expect(await pass(['H1'], T3)).toEqual({ opened: 0, updated: 0, closed: 2, deferred: 0 });
    expect(issues().map((i) => i.state)).toEqual(['CLOSED', 'CLOSED']);
  });

  it('an open hit of the search is adopted after the database lost the issue, also at the limit of new issues', async () => {
    runner.results.set('H1', failed('FAIL a'));
    await pass(['H1'], T1);
    await truncateAll(db.pool);
    expect(await pass(['H1'], T2, 0)).toEqual({ opened: 0, updated: 1, closed: 0, deferred: 0 });
    expect(issues()).toHaveLength(1);
    expect(issues()[0]!.body).toContain(`Last failed: ${T2.toISOString()}`);
    const open = await goals.listOpen(REPO, 'H1');
    expect(open.map((i) => i.issueNumber)).toEqual([issues()[0]!.number]);

    const searches = () => gh.read().calls.filter((c) => c.args[1] === 'list').length;
    const before = searches();
    expect(await pass(['H1'], T3)).toEqual({ opened: 0, updated: 1, closed: 0, deferred: 0 });
    expect(searches()).toBe(before);
    expect(issues()[0]!.body).toContain('Failed passes: 2');
  });

  it('isDue is true with no schedule and when next_at has come, and markRan moves next_at to the next cron time', async () => {
    expect(await service.isDue(REPO, T1)).toBe(true);
    await service.markRan(REPO, '0 2 * * *', 'UTC', T1);
    expect(await goals.getSchedule(REPO)).toEqual({ repo: REPO, lastAt: T1, nextAt: T2 });
    expect(await service.isDue(REPO, new Date(T2.getTime() - 1))).toBe(false);
    expect(await service.isDue(REPO, T2)).toBe(true);
    await service.markRan(REPO, '0 2 * * *', 'Asia/Ho_Chi_Minh', T1);
    expect((await goals.getSchedule(REPO))?.nextAt).toEqual(new Date('2026-11-01T19:00:00.000Z'));
  });
});
