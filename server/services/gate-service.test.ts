// The gate of spec 2.8: the only actor that merges. Memory repositories, the real workspace on a bare repository, and
// `GhGitHost` on the fake `gh`. The commands are small fake ones. `sleep` is injected and never waits.
import { readdirSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import type { GateStep } from '../../shared/domain/gate';
import { EXAM, GITHUB_REPO, GOOD_FILES, TEST_LINE, VERIFY_LINE, createGateWorld, disposeGateSeed, type WorldPr } from '../../tests/support/gate-world';
import { RandomIdGenerator } from '../adapters/ids/random-id-generator';
import { createMemoryRepositories } from '../adapters/memory';
import { DefaultGateService, outputTail } from './gate-service';

const KEY = '141';
const REPO_ID = '11111111-1111-4111-8111-111111111111';
const FAILED_CHECK = { name: 'checks', status: 'completed', conclusion: 'failure' };
const PENDING_CHECK = { name: 'checks', status: 'in_progress', conclusion: null };
const PASSED_CHECK = { name: 'checks', status: 'completed', conclusion: 'success' };
const ALL_STEPS = ['scope', 'base', 'setup', 'green', 'stub', 'verify', 'ci', 'merge'];

const clock = (() => {
  let ticks = 0;
  return { now: () => new Date(Date.UTC(2026, 10, 1) + ++ticks * 1000) };
})();

/** One world for each test. The tests wait on child processes, so they run at the same time. */
async function setup() {
  const world = createGateWorld();
  const repos = createMemoryRepositories();
  const setGate = (over: { enabled?: boolean; checkCommand?: string[] } = {}) =>
    repos.gate.setRepoGate(REPO_ID, { enabled: true, githubRepo: GITHUB_REPO, checkCommand: [], ...over }, clock.now());
  await repos.repos.insert({ id: REPO_ID, name: 'gate repo', path: world.repoPath, createdAt: clock.now() });
  await setGate();
  const service = new DefaultGateService({
    gate: repos.gate,
    repos: repos.repos,
    host: world.host,
    workspace: world.workspace,
    commands: world.runner,
    clock,
    ids: new RandomIdGenerator(),
    sleep: world.sleep,
  });
  const queue = async (pr: WorldPr, taskKey = KEY): Promise<string> => (await service.queue({ repoId: REPO_ID, prNumber: pr.number, taskKey })).jobId!;
  const result = async (id: string) => {
    const job = await repos.gate.get(id);
    const steps = await repos.gate.listSteps(id);
    return {
      id,
      state: job!.state,
      failedStep: job!.failedStep,
      steps,
      names: steps.map((s) => s.step),
      step: (name: string) => steps.find((s) => s.step === name) as GateStep,
    };
  };
  /** Queues the PR, runs one tick, and gives the job with its steps. */
  const runJob = async (pr: WorldPr, taskKey = KEY) => {
    const id = await queue(pr, taskKey);
    await service.tick();
    return result(id);
  };
  const noFolderLeft = () => expect(readdirSync(world.root)).toEqual([]);
  const lastStatus = (sha: string) => world.statuses(sha).at(-1);
  return { world, repos, setGate, service, queue, result, runJob, noFolderLeft, lastStatus };
}

afterAll(disposeGateSeed);

const test = (name: string, body: (t: Awaited<ReturnType<typeof setup>>) => Promise<void>) =>
  it.concurrent(name, async () => {
    const t = await setup();
    try {
      await body(t);
    } finally {
      t.world.dispose();
    }
  });

describe('gate_service', { timeout: 120_000 }, () => {
  test('control: 8 steps pass in order, success comes before the merge call, verify sees the implementation, no folder stays', async ({ world, runJob, noFolderLeft }) => {
    const pr = world.openPr();
    const job = await runJob(pr);

    expect(job.state).toBe('merged');
    expect(job.steps.map((s) => [s.step, s.status])).toEqual(ALL_STEPS.map((s) => [s, 'pass']));
    expect(job.steps.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(job.step('verify').outputTail).toContain('verify sees impl.mjs');
    expect(job.step('verify').outputTail).toContain('env from-main');
    expect(world.bare.show('main', 'impl.mjs')).toContain('ok = true');
    expect(world.statuses(pr.headSha).map((s) => s.state)).toEqual(['pending', 'success']);
    const calls = world.gh.read().calls.map((c) => c.args.join(' '));
    const success = calls.findIndex((c) => c.includes('state=success'));
    const merge = calls.findIndex((c) => c.startsWith('pr merge'));
    expect(success).toBeGreaterThan(-1);
    expect(success).toBeLessThan(merge);
    noFolderLeft();
  });

  test('exam from main: a ratified PR rewrites its verify entry and gate.json, the entry of main fails it, and no line of the PR ran', async ({ world, repos, service, queue, result }) => {
    const forged = { green: [{ run: 'node pwned.mjs', expect: ['pwned'] }], stub: { none: 'nothing to stub' } };
    const pr = world.openPr({
      files: {
        'pwned.mjs': `console.log('pwned');\n`,
        'goals/verify/e.json': JSON.stringify({ v: 1, tasks: { [KEY]: forged } }),
        'goals/gate.json': JSON.stringify({ v: 1, setup: ['node pwned.mjs'], verify: ['node pwned.mjs'], env: {}, guarded: [], testGlobs: ['**'] }),
      },
    });
    const id = await queue(pr);
    await service.tick();
    expect((await result(id)).state).toBe('needs_ratification');
    expect(await repos.gate.ratify(id, clock.now())).toBe(true);
    await service.tick();

    const job = await result(id);
    expect([job.state, job.failedStep]).toEqual(['failed', 'green']);
    expect(world.lines().filter((line) => line.includes('pwned'))).toEqual([]);
    expect(world.lines()).toContain(TEST_LINE);
    expect(world.mergeCalls()).toEqual([]);
    expect(() => world.bare.show('main', 'pwned.mjs')).toThrow();
  });

  test('the same PR with no ratification: needs_ratification, and 0 commands run', async ({ world, runJob, lastStatus }) => {
    const pr = world.openPr({ files: { 'goals/verify/e.json': JSON.stringify({ v: 1, tasks: {} }), 'goals/gate.json': '{}' } });
    const job = await runJob(pr);
    expect([job.state, job.failedStep]).toEqual(['needs_ratification', 'scope']);
    expect(world.lines()).toEqual([]);
    expect(lastStatus(pr.headSha)).toMatchObject({ state: 'failure' });
    expect(lastStatus(pr.headSha)!.description).toMatch(/^scope: /);
  });

  test('a change to the scripts of package.json gives needs_ratification', async ({ world, runJob }) => {
    const pr = world.openPr({ files: { ...GOOD_FILES, 'package.json': JSON.stringify({ scripts: { test: 'node -e 0' } }) } });
    const job = await runJob(pr);
    expect(job.state).toBe('needs_ratification');
    expect(world.lines()).toEqual([]);
  });

  test('a task with no entry fails green', async ({ world, runJob }) => {
    const job = await runJob(world.openPr(), 'no-such-key');
    expect([job.state, job.failedStep]).toEqual(['failed', 'green']);
    expect(job.step('green').outputTail).toMatch(/no entry/);
  });

  test('a key in two verify files fails green', async ({ world, runJob }) => {
    world.setEntry(KEY, EXAM, 'f.json');
    const job = await runJob(world.openPr());
    expect(job.failedStep).toBe('green');
    expect(job.step('green').outputTail).toMatch(/2 verify files/);
  });

  test('an entry with an empty green fails green', async ({ world, runJob }) => {
    world.setEntry(KEY, { green: [], stub: { none: 'x' } });
    const job = await runJob(world.openPr());
    expect(job.failedStep).toBe('green');
    expect(job.step('green').outputTail).toMatch(/empty green/);
  });

  test('a green line that exits 1 fails green', async ({ world, runJob }) => {
    world.setEntry(KEY, { green: [{ run: 'node -e "process.exit(1)"', expect: [] }], stub: { none: 'x' } });
    const job = await runJob(world.openPr());
    expect(job.failedStep).toBe('green');
    expect(job.step('green').exitCode).toBe(1);
  });

  test('a green line with double quotes that exits non-zero fails green, with its own exit code', async ({ world, runJob }) => {
    world.setEntry(KEY, { green: [{ run: `node -e "console.log('e passed'); process.exit(3)"`, expect: ['e passed'] }], stub: { none: 'x' } });
    const job = await runJob(world.openPr());
    expect([job.state, job.failedStep]).toEqual(['failed', 'green']);
    expect(job.step('green').exitCode).toBe(3);
    expect(world.mergeCalls()).toEqual([]);
  });

  test('a green line that exits 0 with a missing expected text fails green', async ({ world, runJob }) => {
    world.setEntry(KEY, { green: [{ run: TEST_LINE, expect: ['a text that no line prints'] }], stub: { none: 'x' } });
    const job = await runJob(world.openPr());
    expect(job.failedStep).toBe('green');
    expect(job.step('green').outputTail).toMatch(/a text that no line prints/);
  });

  test('a PR with no implementation fails green', async ({ world, runJob }) => {
    const job = await runJob(world.openPr({ files: { 'tests/e.test.mjs': GOOD_FILES['tests/e.test.mjs']! } }));
    expect(job.failedStep).toBe('green');
  });

  test('an always-true test fails stub', async ({ world, runJob, noFolderLeft }) => {
    const alwaysTrue = `import { existsSync } from 'node:fs';\nconsole.log('e passed', existsSync('impl.mjs') ? 'with the implementation' : 'with no implementation');\n`;
    const pr = world.openPr({ files: { 'impl.mjs': 'export const ok = true;\n', 'tests/e.test.mjs': alwaysTrue } });
    const job = await runJob(pr);
    expect([job.state, job.failedStep]).toEqual(['failed', 'stub']);
    expect(job.step('green').status).toBe('pass');
    expect(job.step('green').outputTail).toContain('with the implementation');
    expect(job.step('stub').outputTail).toContain('with no implementation');
    expect(world.mergeCalls()).toEqual([]);
    noFolderLeft();
  });

  test('stub.none skips stub and keeps the reason', async ({ world, runJob }) => {
    world.setEntry(KEY, { ...EXAM, stub: { none: 'a docs change has nothing to stub' } });
    const job = await runJob(world.openPr());
    expect(job.state).toBe('merged');
    expect(job.step('stub')).toMatchObject({ status: 'skip', outputTail: expect.stringContaining('a docs change has nothing to stub') });
  });

  test('a stub time-out is not a red stub', async ({ world, runJob }) => {
    let lines = 0;
    world.onCommand(TEST_LINE, () => (++lines === 2 ? { exitCode: null, stdout: '', stderr: '', timedOut: true, error: null } : undefined));
    const job = await runJob(world.openPr());
    expect([job.state, job.failedStep]).toEqual(['failed', 'stub']);
    expect(job.step('stub').outputTail).toMatch(/timed out/);
  });

  test('a stub line that holds test:e2e fails stub and does not run', async ({ world, runJob }) => {
    world.setEntry(KEY, { ...EXAM, stub: { run: 'npm run test:e2e' } });
    const job = await runJob(world.openPr());
    expect(job.failedStep).toBe('stub');
    expect(world.lines()).not.toContain('npm run test:e2e');
  });

  test('a plan PR passes scope, skips green and stub, and merges', async ({ world, runJob }) => {
    const tasks = { [KEY]: EXAM, 142: EXAM };
    const pr = world.openPr({ files: { 'goals/verify/e.json': `${JSON.stringify({ v: 1, tasks }, null, 2)}\n`, 'docs/plans/p.md': 'a plan\n' } });
    const job = await runJob(pr, 'plan-1');
    expect(job.state).toBe('merged');
    expect(job.steps.map((s) => s.status)).toEqual(['pass', 'pass', 'pass', 'skip', 'skip', 'pass', 'pass', 'pass']);
    expect(job.step('green').outputTail).toMatch(/plan/);
  });

  test('a failing verify line stops the job', async ({ world, runJob }) => {
    const job = await runJob(world.openPr({ files: { ...GOOD_FILES, 'fail-verify.txt': 'x' } }));
    expect([job.state, job.failedStep]).toEqual(['failed', 'verify']);
    expect(world.mergeCalls()).toEqual([]);
  });

  test('a failed check run fails ci at once', async ({ world, runJob, lastStatus }) => {
    const pr = world.openPr({ checks: [FAILED_CHECK] });
    const job = await runJob(pr);
    expect(job.failedStep).toBe('ci');
    expect(world.sleeps).toEqual([]);
    expect(lastStatus(pr.headSha)!.description).toMatch(/^ci: /);
  });

  test('a pending check run waits 30 s through sleep, then passes', async ({ world, runJob }) => {
    const pr = world.openPr({ checks: [PENDING_CHECK] });
    world.onSleep = () => world.setChecks(pr.headSha, [PASSED_CHECK]);
    const job = await runJob(pr);
    expect(job.state).toBe('merged');
    expect(world.sleeps).toEqual([30_000]);
  });

  test('no check run after the last read fails ci, so a repository with no CI cannot pass', async ({ world, runJob }) => {
    const job = await runJob(world.openPr({ checks: [] }));
    expect(job.failedStep).toBe('ci');
    expect(world.sleeps).toHaveLength(59);
    expect(world.mergeCalls()).toEqual([]);
  });

  test('main that moved once runs the job again: 2 scope rows, seq goes on, merged', async ({ world, runJob }) => {
    let moves = 0;
    world.onCommand(VERIFY_LINE, () => {
      if (++moves === 1) world.commitMain({ 'other.txt': 'moved\n' });
    });
    const job = await runJob(world.openPr());
    expect(job.state).toBe('merged');
    expect(job.names.filter((name) => name === 'scope')).toHaveLength(2);
    expect(job.steps.map((s) => s.seq)).toEqual(job.steps.map((_, i) => i + 1));
    expect(world.mergeCalls()).toHaveLength(1);
    expect(world.bare.show('main', 'other.txt')).toBe('moved\n');
  });

  test('main that moved twice fails merge with 0 merge calls', async ({ world, runJob }) => {
    let moves = 0;
    world.onCommand(VERIFY_LINE, () => void world.commitMain({ 'other.txt': `move ${++moves}\n` }));
    const pr = world.openPr();
    const job = await runJob(pr);
    expect([job.state, job.failedStep]).toEqual(['failed', 'merge']);
    expect(moves).toBe(2);
    expect(world.mergeCalls()).toEqual([]);
    expect(world.statuses(pr.headSha).map((s) => s.state)).not.toContain('success');
  });

  test('a head that moved in verify: the merge carries job.headSha, it is refused, and the new commit is not on main', async ({ world, runJob }) => {
    const pr = world.openPr();
    world.onCommand(VERIFY_LINE, () => void world.commitToPr(pr, { 'late.txt': 'not checked\n' }));
    const job = await runJob(pr);
    expect([job.state, job.failedStep]).toEqual(['failed', 'merge']);
    const [merge] = world.mergeCalls();
    expect(merge![merge!.indexOf('--match-head-commit') + 1]).toBe(pr.headSha);
    expect(() => world.bare.show('main', 'late.txt')).toThrow();
    expect(world.statuses(pr.headSha).map((s) => s.state)).toEqual(['pending', 'success', 'failure']);
  });

  test('a PR on another base branch fails scope', async ({ world, runJob }) => {
    const job = await runJob(world.openPr({ base: 'dev' }));
    expect([job.state, job.failedStep]).toEqual(['failed', 'scope']);
    expect(world.lines()).toEqual([]);
  });

  test('a conflict with main fails base, names the file, and leaves no folder', async ({ world, runJob, noFolderLeft }) => {
    const pr = world.openPr({ files: { ...GOOD_FILES, 'conflict.txt': 'from the PR\n' } });
    world.commitMain({ 'conflict.txt': 'from main\n' });
    const job = await runJob(pr);
    expect(job.failedStep).toBe('base');
    expect(job.step('base').outputTail).toContain('conflict.txt');
    noFolderLeft();
  });

  test('requeueRunning: a job left running runs again, and its seq goes on', async ({ world, repos, service, queue, result }) => {
    const id = await queue(world.openPr());
    await repos.gate.takeNext(clock.now());
    await repos.gate.appendStep({ jobId: id, seq: 1, step: 'scope', status: 'pass', exitCode: 0, ms: 1, outputTail: 'before the crash' });
    expect(await repos.gate.requeueRunning(clock.now())).toBe(1);
    await service.tick();
    const job = await result(id);
    expect(job.state).toBe('merged');
    expect(job.steps.map((s) => s.seq)).toEqual(Array.from({ length: 9 }, (_, i) => i + 1));
  });

  test('a restart after the merge and before finish: the job ends merged, with no step run and no second merge call', async ({ world, repos, service, queue, result }) => {
    const pr = world.openPr();
    const id = await queue(pr);
    await repos.gate.takeNext(clock.now());
    await world.host.setStatus(GITHUB_REPO, pr.headSha, { state: 'success', description: 'gate: every step passed' });
    await world.host.merge(GITHUB_REPO, pr.number, pr.headSha);
    expect(await repos.gate.requeueRunning(clock.now())).toBe(1);
    await service.tick();

    const job = await result(id);
    expect([job.state, job.failedStep]).toEqual(['merged', null]);
    expect(job.names).not.toContain('base');
    expect(world.mergeCalls()).toHaveLength(1);
    expect(world.statuses(pr.headSha).map((s) => s.state)).toEqual(['success']);
  });

  test('a restart after a merge with no success status on the commit still fails scope', async ({ world, repos, service, queue, result }) => {
    const pr = world.openPr();
    const id = await queue(pr);
    await repos.gate.takeNext(clock.now());
    await world.host.merge(GITHUB_REPO, pr.number, pr.headSha);
    expect(await repos.gate.requeueRunning(clock.now())).toBe(1);
    await service.tick();

    const job = await result(id);
    expect([job.state, job.failedStep]).toEqual(['failed', 'scope']);
    expect(job.step('scope').outputTail).toContain('MERGED');
    expect(world.mergeCalls()).toHaveLength(1);
  });

  test('a restart after a merge of another head than the job head still fails scope, though the job head has success', async ({ world, repos, service, queue, result }) => {
    const pr = world.openPr();
    const id = await queue(pr);
    await repos.gate.takeNext(clock.now());
    await world.host.setStatus(GITHUB_REPO, pr.headSha, { state: 'success', description: 'gate: every step passed' });
    const later = world.commitToPr(pr, { 'late.txt': 'not checked\n' });
    await world.host.merge(GITHUB_REPO, pr.number, later);
    expect(await repos.gate.requeueRunning(clock.now())).toBe(1);
    await service.tick();

    const job = await result(id);
    expect([job.state, job.failedStep]).toEqual(['failed', 'scope']);
    expect(world.mergeCalls()).toHaveLength(1);
  });

  test('stop aborts the running command, and the job stays running for the next start', async ({ world, repos, service, queue, result, noFolderLeft, lastStatus }) => {
    world.setGate({ verify: ['node -e "setInterval(() => {}, 1000)"'] });
    let stopped: Promise<void> | undefined;
    world.onCommand('setInterval', () => {
      setTimeout(() => (stopped = service.stop()), 100);
    });
    const pr = world.openPr();
    const id = await queue(pr);
    await service.tick();
    await stopped;

    expect((await repos.gate.get(id))?.state).toBe('running');
    expect((await result(id)).names).not.toContain('verify');
    expect(world.mergeCalls()).toEqual([]);
    expect(lastStatus(pr.headSha)).toMatchObject({ state: 'pending' });
    noFolderLeft();
    expect(await service.tick()).toEqual({ jobId: null, errors: [] });
    service.resume();
    expect(await repos.gate.requeueRunning(clock.now())).toBe(1);
  });

  test('100 lines of output keep the last 60', async ({ world, runJob }) => {
    const line = `node -e "for (let i = 1; i <= 100; i++) console.log('line ' + i)"`;
    world.setEntry(KEY, { green: [{ run: line, expect: ['line 100'] }], stub: { none: 'x' } });
    const job = await runJob(world.openPr());
    const kept = job.step('green').outputTail.split('\n');
    expect(kept).toHaveLength(60);
    expect(kept[0]).toBe('line 41');
    expect(kept.at(-1)).toBe('line 100');
    expect(outputTail('a\r\nb\n')).toBe('a\nb');
  });

  test('two jobs run in order, one for each tick', async ({ world, repos, service, queue, result }) => {
    world.setEntry('142', { ...EXAM, stub: { none: 'the first PR holds the implementation' } });
    const first = world.openPr();
    const second = world.openPr({ files: { ...GOOD_FILES, 'second.txt': '2\n' } });
    const a = await queue(first);
    const b = await queue(second, '142');

    expect((await service.tick()).jobId).toBe(a);
    expect((await repos.gate.get(b))?.state).toBe('queued');
    expect((await result(a)).state).toBe('merged');
    expect((await service.tick()).jobId).toBe(b);
    expect((await result(b)).state).toBe('merged');
    expect(world.mergeCalls().map((call) => call[2])).toEqual([String(first.number), String(second.number)]);
  });

  test('check_command runs after the merge with {key} replaced, and a failure does not undo the merge', async ({ world, setGate, runJob }) => {
    await setGate({ checkCommand: [process.execPath, '-e', 'console.log("checked " + process.argv[1]); process.exit(1)', '{key}'] });
    const job = await runJob(world.openPr());
    expect(job.state).toBe('merged');
    expect(job.step('merge')).toMatchObject({ status: 'pass', outputTail: expect.stringContaining(`checked ${KEY}`) });
  });

  test('a queued job whose repository turned the gate off fails scope and makes no call to GitHub', async ({ world, setGate, service, queue, result }) => {
    const id = await queue(world.openPr());
    await setGate({ enabled: false });
    const calls = world.gh.read().calls.length;
    await service.tick();
    const job = await result(id);
    expect([job.state, job.failedStep]).toEqual(['failed', 'scope']);
    expect(job.step('scope').outputTail).toContain('GATE_OFF');
    expect(world.gh.read().calls.length).toBe(calls);
  });
});
