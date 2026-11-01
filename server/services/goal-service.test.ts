// The goal number after a merge (spec 2.10, decision 42). Memory repositories, the real workspace on a bare repository,
// `GhGitHost` on the fake `gh`, and the real text of `scripts/goal-check.mjs` with small fake rows.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { fingerprint } from '../../shared/domain/fingerprint';
import { GITHUB_REPO, VERIFY_LINE, createGateWorld, disposeGateSeed } from '../../tests/support/gate-world';
import { RandomIdGenerator } from '../adapters/ids/random-id-generator';
import { createMemoryRepositories } from '../adapters/memory';
import type { GoalService } from './contracts';
import { FakeClaimGateway } from '../../tests/support/fake-claim-gateway';
import { DefaultGateService } from './gate-service';
import { DefaultGoalService } from './goal-service';

const REPO_ID = '11111111-1111-4111-8111-111111111111';
const KEY = '141';
const EPIC = 1;
const MANIFEST = 'goals/g.json';
const START = Date.UTC(2026, 10, 1);
const HOUR = 3_600_000;
/** One test makes many git and `gh` processes, and the tests run at the same time. */
const TEST_TIMEOUT_MS = 240_000;
const GOAL_CHECK = readFileSync(new URL('../../scripts/goal-check.mjs', import.meta.url), 'utf8');

/** One row of a small manifest. A rule in `tests/rows.json` says if it fails, what it needs and which value it prints. */
const ROW_FILE = `import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const id = process.argv[2];
appendFileSync(process.env.ROW_LOG, id + '\\n');
const rule = JSON.parse(readFileSync('tests/rows.json', 'utf8'))[id] ?? {};
if (rule.value !== undefined) console.log(rule.value + '/8 rows');
process.exit(rule.fail || (rule.needs && !existsSync(rule.needs)) ? 1 : 0);
`;

type Rule = { fail?: boolean; needs?: string; value?: number };
type Goal = { id: string; cadence?: 'merge' | 'nightly'; scored?: boolean };

const goalOf = ({ id, cadence, scored }: Goal) => ({
  id,
  outcome: `row ${id}`,
  ...(cadence ? { cadence } : {}),
  checks: [{ run: `node tests/row.mjs ${id}`, ...(scored ? { score: '(\\d+)/(\\d+) rows' } : {}) }],
});
const manifestText = (goals: Goal[], epic: number | null = EPIC) => `${JSON.stringify({ setup: [], ...(epic === null ? {} : { epic }), goals: goals.map(goalOf) }, null, 2)}\n`;
const rulesText = (rules: Record<string, Rule>) => `${JSON.stringify(rules)}\n`;

async function setup() {
  const world = createGateWorld();
  const repos = createMemoryRepositories();
  let nowMs = START;
  const clock = { now: () => new Date(nowMs) };
  await repos.repos.insert({ id: REPO_ID, name: 'gate repo', path: world.repoPath, createdAt: clock.now() });
  await repos.gate.setRepoGate(REPO_ID, { enabled: true, githubRepo: GITHUB_REPO, checkCommand: [] }, clock.now());
  await world.host.openIssue(GITHUB_REPO, { title: 'the epic', body: '', labels: [] });
  const rowLog = `${world.gh.world}.rows.log`;
  world.setGate({ env: { ROW_LOG: rowLog } });
  world.commitMain({ 'scripts/goal-check.mjs': GOAL_CHECK, 'tests/row.mjs': ROW_FILE, 'tests/rows.json': rulesText({}) });

  const deps = { goals: repos.goals, repos: repos.repos, gate: repos.gate, host: world.host, workspace: world.workspace, clock, ids: new RandomIdGenerator() };
  const goals = new DefaultGoalService(deps);
  const gateWith = (service: GoalService) =>
    new DefaultGateService({ gate: repos.gate, repos: repos.repos, host: world.host, workspace: world.workspace, commands: world.runner, claims: repos.claims, probes: repos.probes, gateway: new FakeClaimGateway(), clock, ids: new RandomIdGenerator(), sleep: world.sleep, goals: service });
  const gate = gateWith(goals);

  let jobs = 0;
  return {
    world,
    repos,
    goals,
    gate,
    gateWith,
    fresh: () => new DefaultGoalService(deps),
    setNow: (ms: number) => void (nowMs = ms),
    manifest: (goals: Goal[], epic?: number | null, file = MANIFEST) => world.commitMain({ [file]: manifestText(goals, epic) }),
    rules: (rules: Record<string, Rule>) => world.commitMain({ 'tests/rows.json': rulesText(rules) }),
    /** One pass with no gate job. */
    merge: () => goals.afterMerge({ repo: GITHUB_REPO, repoPath: world.repoPath, jobId: `job-${++jobs}` }),
    queue: async (prNumber: number, taskKey = KEY) => (await gate.queue({ repoId: REPO_ID, prNumber, taskKey })).jobId!,
    comments: () => world.gh.read().issues.find((i) => i.number === EPIC)!.comments.map((c) => c.body),
    numbers: () =>
      world.gh
        .read()
        .issues.filter((i) => i.number !== EPIC)
        .map((i) => i.number),
    goalChecks: () => world.lines().filter((line) => line.includes('goal-check.mjs')),
    rowsRan: () => (existsSync(rowLog) ? readFileSync(rowLog, 'utf8').trim().split(/\r?\n/) : []),
    mainSha: () => world.bare.sha('main').slice(0, 7),
  };
}

const goalLine = (passed: number, total: number, failing: string[], sha: string) => `loop-goals: ${JSON.stringify({ passed, total, failing, sha })}`;
const storedRow = (rowId: string, atMs: number) => ({ repo: GITHUB_REPO, manifest: MANIFEST, rowId, pass: true, value: null, of: null, line: `${rowId} pass`, cadence: 'nightly' as const, sha: 'abc1234', at: new Date(atMs) });

afterAll(disposeGateSeed);

const test = (name: string, body: (t: Awaited<ReturnType<typeof setup>>) => Promise<void>) =>
  it.concurrent(name, async () => {
    const t = await setup();
    try {
      await body(t);
    } finally {
      t.world.dispose();
    }
  }, TEST_TIMEOUT_MS);

const THREE: Goal[] = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];

describe('goal_service', () => {
  test('a merge that adds impl.mjs moves the comment from 2/3 to 3/3', async (t) => {
    t.manifest(THREE);
    t.rules({ C: { needs: 'impl.mjs' } });
    expect((await t.merge()).errors).toEqual([]);
    const first = goalLine(2, 3, ['C'], t.mainSha());
    expect(t.comments()).toEqual([first]);

    const pr = t.world.openPr();
    const id = await t.queue(pr.number);
    const report = await t.gate.tick();
    expect(report).toEqual({ jobId: id, errors: [] });
    expect((await t.repos.gate.get(id))?.state).toBe('merged');
    expect(t.comments()).toEqual([first, `loop-goals: {"passed":3,"total":3,"failing":[],"sha":"${t.mainSha()}"}`]);
  });

  test('the comment comes before the first command of the next job', async (t) => {
    t.manifest(THREE);
    t.world.setEntry('142', { green: [{ run: VERIFY_LINE, expect: ['verify sees'] }], stub: { none: 'a text file' } });
    await t.queue(t.world.openPr().number);
    await t.gate.tick();

    const seen: number[] = [];
    t.world.onCommand(VERIFY_LINE, () => void seen.push(t.comments().length));
    const id = await t.queue(t.world.openPr({ files: { 'two.txt': 'two\n' } }).number, '142');
    await t.gate.tick();
    expect((await t.repos.gate.get(id))?.state).toBe('merged');
    expect(seen[0]).toBe(1);
    expect(t.comments()).toHaveLength(2);
  });

  test('a nightly row does not run after a merge, it is in failing when it never ran, and total stays 3', async (t) => {
    t.manifest([{ id: 'A' }, { id: 'B' }, { id: 'N', cadence: 'nightly' }]);
    expect((await t.merge()).errors).toEqual([]);
    expect(t.rowsRan()).toEqual(['A', 'B']);
    expect(t.goalChecks()).toEqual([`node scripts/goal-check.mjs ${MANIFEST} --json --cadence merge`]);
    expect(t.comments()).toEqual([goalLine(2, 3, ['N'], t.mainSha())]);
  });

  test('a stored nightly pass counts in the number of a merge', async (t) => {
    t.manifest([{ id: 'A' }, { id: 'B' }, { id: 'N', cadence: 'nightly' }]);
    await t.repos.goals.saveRows([storedRow('N', START - HOUR)]);
    await t.merge();
    expect(t.rowsRan()).toEqual(['A', 'B']);
    expect(t.comments()).toEqual([goalLine(3, 3, [], t.mainSha())]);
  });

  test('a closed epic runs 0 commands', async (t) => {
    t.manifest(THREE);
    await t.world.host.closeIssue(GITHUB_REPO, EPIC);
    const before = t.world.lines().length;
    expect((await t.merge()).errors).toEqual([]);
    expect(t.world.lines().slice(before)).toEqual([]);
    expect(t.comments()).toEqual([]);
  });

  test('a manifest with no epic runs 0 commands', async (t) => {
    t.manifest(THREE, null);
    const before = t.world.lines().length;
    expect((await t.merge()).errors).toEqual([]);
    expect(t.world.lines().slice(before)).toEqual([]);
    expect(t.comments()).toEqual([]);
  });

  test('a bad line gives no comment, and any failure here leaves the job merged', async (t) => {
    t.manifest(THREE);
    t.world.onCommand('goal-check.mjs', () => ({ exitCode: 0, stdout: 'this is not the line\n', stderr: '', timedOut: false, error: null }));
    const pr = t.world.openPr();
    const id = await t.queue(pr.number);
    const report = await t.gate.tick();
    expect(report.errors).toEqual([{ loopId: id, message: expect.stringContaining('goal-check') as string }]);
    expect((await t.repos.gate.get(id))?.state).toBe('merged');
    expect(t.world.gh.read().prs.find((p) => p.number === pr.number)?.state).toBe('MERGED');
    expect(t.comments()).toEqual([]);

    // A goal pass that throws: the job has its final state, and the throw goes to the report of the tick.
    t.world.setEntry('142', { green: [{ run: VERIFY_LINE, expect: ['verify sees'] }], stub: { none: 'a text file' } });
    const broken: GoalService = { afterMerge: () => Promise.reject(new Error('the goal pass broke')), nightly: () => Promise.resolve({ errors: [] }) };
    const gate = t.gateWith(broken);
    const pr2 = t.world.openPr({ files: { 'two.txt': 'two\n' } });
    const id2 = (await gate.queue({ repoId: REPO_ID, prNumber: pr2.number, taskKey: '142' })).jobId!;
    expect((await gate.tick()).errors).toEqual([{ loopId: id2, message: 'the goal pass broke' }]);
    expect((await t.repos.gate.get(id2))?.state).toBe('merged');
    expect(t.world.gh.read().prs.find((p) => p.number === pr2.number)?.state).toBe('MERGED');
    expect(t.world.statuses(pr2.headSha).at(-1)?.state).toBe('success');
  });

  test('a row that falls opens 1 issue and 1 sub-issue of the epic', async (t) => {
    t.manifest(THREE);
    await t.merge();
    t.rules({ A: { fail: true } });
    expect((await t.merge()).errors).toEqual([]);
    const fp = fingerprint(GITHUB_REPO, `${MANIFEST}:A`, 'A FAIL');
    const issues = t.world.gh.read().issues.filter((i) => i.number !== EPIC);
    expect(issues.map((i) => [i.title, i.body])).toEqual([['goal A fell: row A', `<!-- fingerprint:${fp} -->\nEpic: ${EPIC}\nA FAIL`]]);
    expect(t.world.gh.read().subIssues).toEqual({ [EPIC]: [issues[0]!.number] });
    expect(await t.repos.goals.findOpen(GITHUB_REPO, fp)).toMatchObject({ issueNumber: issues[0]!.number });
    expect(t.comments().at(-1)).toBe(goalLine(2, 3, ['A'], t.mainSha()));
  });

  test('the next merge keeps 1 issue, and a fall after that issue closed opens a new one', async (t) => {
    t.manifest(THREE);
    await t.merge();
    t.rules({ A: { fail: true } });
    await t.merge();
    await t.repos.goals.saveRows([{ ...storedRow('A', START), cadence: 'merge' }]);
    await t.merge();
    expect(t.numbers()).toHaveLength(1);
    expect(t.world.gh.read().subIssues[EPIC]).toHaveLength(1);

    await t.world.host.closeIssue(GITHUB_REPO, t.numbers()[0]!);
    t.rules({});
    await t.merge();
    t.rules({ A: { fail: true } });
    expect((await t.merge()).errors).toEqual([]);
    expect(t.numbers()).toHaveLength(2);
    expect(t.world.gh.read().subIssues[EPIC]).toHaveLength(2);
  });

  test('a row that is red from the start opens 0 issues', async (t) => {
    t.manifest(THREE);
    t.rules({ B: { fail: true } });
    await t.merge();
    await t.merge();
    expect(t.numbers()).toEqual([]);
    expect(t.comments().at(-1)).toBe(goalLine(2, 3, ['B'], t.mainSha()));
  });

  test('a value that falls from 5 to 4 opens 1 issue, and the same row id of another epic has its own', async (t) => {
    t.manifest([{ id: 'A', scored: true }]);
    t.rules({ A: { value: 5 } });
    await t.merge();
    t.rules({ A: { value: 6 } });
    await t.merge();
    expect(t.numbers()).toEqual([]);
    t.rules({ A: { value: 4 } });
    await t.merge();
    expect(t.world.gh.read().issues.at(-1)?.body).toContain('A 4/8 rows');
    expect(t.numbers()).toHaveLength(1);
    expect(t.comments().at(-1)).toBe(goalLine(1, 1, [], t.mainSha()));

    await t.world.host.openIssue(GITHUB_REPO, { title: 'another epic', body: '', labels: [] });
    const other = t.world.gh.read().issues.at(-1)!.number;
    t.manifest([{ id: 'A', scored: true }], other, 'goals/z.json');
    await t.merge();
    t.rules({ A: { value: 3 } });
    await t.merge();
    const issues = t.world.gh.read().issues.filter((i) => i.title.startsWith('goal A fell'));
    expect(issues).toHaveLength(2);
    expect(issues[1]!.body).toContain(`Epic: ${other}`);
  });

  test('when the gate has no job, a tick runs the nightly rows that last ran more than 24 h ago', async (t) => {
    t.manifest([{ id: 'A' }, { id: 'B' }, { id: 'N', cadence: 'nightly' }]);
    await t.repos.goals.saveRows([storedRow('N', START - 25 * HOUR)]);
    expect(await t.gate.tick()).toEqual({ jobId: null, errors: [] });
    expect(t.rowsRan()).toEqual(['N']);
    expect(t.goalChecks()).toEqual([`node scripts/goal-check.mjs ${MANIFEST} --json --cadence nightly`]);
    expect(t.comments()).toEqual([goalLine(1, 3, ['A', 'B'], t.mainSha())]);
  });

  test('nightly rows that ran less than 24 h ago do not run, and an idle gate reads main once an hour', async (t) => {
    t.manifest([{ id: 'A' }, { id: 'N', cadence: 'nightly' }]);
    await t.repos.goals.saveRows([storedRow('N', START - 23.9 * HOUR)]);
    const goals = t.fresh();
    expect(await goals.nightly(new Date(START))).toEqual({ errors: [] });
    expect(t.goalChecks()).toEqual([]);

    await goals.nightly(new Date(START + HOUR / 2));
    expect(t.goalChecks()).toEqual([]);
    await goals.nightly(new Date(START + HOUR));
    expect(t.rowsRan()).toEqual(['N']);
  });

  test('the worktree of a pass is removed after a failure', async (t) => {
    t.manifest(THREE);
    t.world.setGate({ setup: [`node -e "process.exit(3)"`] });
    const { errors } = await t.merge();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('setup');
    expect(t.world.lines()).toContain(`node -e "process.exit(3)"`);
    expect(t.goalChecks()).toEqual([]);
    expect(t.comments()).toEqual([]);
    expect(readdirSync(t.world.root)).toEqual([]);
  });
});
