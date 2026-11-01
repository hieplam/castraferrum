// ProbeService.tick (spec 2.1, decision 22): when a probe runs and what its line does. Time comes only from the wound clock, and a hung probe is a pending promise.
import { beforeEach, describe, expect, it } from 'vitest';
import type { CommandResult } from '../ports/command-runner';
import { commandOk } from '../../tests/support/fake-command-runner';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';

const SEC = 1000;
const SKIP = '{"v":1,"action":"skip"}';
const at = (ms: number) => new Date(T0.getTime() + ms);

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

async function probeLoop(over: Parameters<Kit['input']>[0] = {}): Promise<string> {
  const { id } = await k.loopService.create(k.input(over));
  await k.probeService.save(id, { command: ['node', 'probe.mjs', '--json'] });
  await k.loopService.start(id);
  await flush();
  return id;
}

function tickAt(ms: number) {
  k.clock.set(at(ms));
  return k.probeService.tick();
}

function deferred() {
  let resolve!: (r: CommandResult) => void;
  const promise = new Promise<CommandResult>((r) => (resolve = r));
  return { promise, resolve };
}

const startRun = async (loopId: string) => {
  const open = await k.repos.executions.findOpen(loopId);
  await k.runService.startFirst(loopId, open!.id);
  await flush();
};

describe('ProbeService.tick', () => {
  it('a loop with no probe keeps its cron schedule and its first run, and the tick calls nothing for it', async () => {
    const loop = await k.loopService.create(k.input());
    const started = await k.loopService.start(loop.id);
    await flush();
    expect(started.nextRunAt).toEqual(at(5 * MIN));
    expect([...k.db.runs.values()].map((r) => r.trigger)).toEqual(['start']);
    k.scripted.call(1).succeed();
    await flush();

    expect(await tickAt(0)).toEqual({ at: at(0), ran: true, probed: [], failed: [], errors: [] });
    expect(k.commands.calls).toEqual([]);

    const scheduled = await k.tickAt(at(5 * MIN));
    expect(scheduled.started).toHaveLength(1);
    expect(k.db.loops.get(loop.id)?.nextRunAt).toEqual(at(10 * MIN));
    expect(k.commands.calls).toEqual([]);
  });

  it('Start of a probe loop gives 0 runs and no next run, and the schedule tick never starts one', async () => {
    const id = await probeLoop();
    expect(k.db.loops.get(id)).toMatchObject({ status: 'active', nextRunAt: null });
    expect((await k.tickAt(at(30 * MIN))).started).toEqual([]);
    expect(k.db.runs.size).toBe(0);
    expect(k.scripted.calls).toEqual([]);
  });

  it('calls the stored argv in the repo folder with a limit of 30 s, and stores the line', async () => {
    const id = await probeLoop();
    const r = await tickAt(0);
    expect(k.commands.calls).toEqual([{ argv: ['node', 'probe.mjs', '--json'], cwd: k.repo.path, timeoutMs: 30_000 }]);
    expect(r).toEqual({ at: at(0), ran: true, probed: [id], failed: [], errors: [] });
    expect(await k.repos.probes.get(id)).toMatchObject({ state: 'active', lastLine: SKIP, lastProbeAt: at(0) });
  });

  it('after a probe, +59 s calls nothing and +60 s calls one more', async () => {
    await probeLoop();
    await tickAt(0);
    expect((await tickAt(59 * SEC)).probed).toEqual([]);
    expect(k.commands.calls).toHaveLength(1);
    expect((await tickAt(60 * SEC)).probed).toHaveLength(1);
    expect(k.commands.calls).toHaveLength(2);
  });

  it('a stopped loop is not probed', async () => {
    const id = await probeLoop();
    await k.loopService.stop(id);
    expect((await tickAt(MIN)).probed).toEqual([]);
    expect(k.commands.calls).toEqual([]);
  });

  for (const [action, fields, state] of [
    ['take', { tasks: [{ key: '141' }] }, 'active'],
    ['plan', { plan: { key: 'plan-217' } }, 'active'],
    ['skip', {}, 'active'],
    ['wait', { reason: 'needs a login' }, 'waiting'],
    ['blocked', { reason: 'red CI', issues: ['212'] }, 'blocked'],
    ['hold', { resource: 'docker', reason: 'docker is down' }, 'held'],
    ['done', {}, 'complete'],
  ] as const) {
    it(`action ${action} gives the state ${state}, and only a take starts a run`, async () => {
      const id = await probeLoop();
      const line = JSON.stringify({ v: 1, action, ...fields });
      k.commands.reply = () => commandOk(`checking\n${line}\n`);
      expect((await tickAt(0)).failed).toEqual([]);
      expect(await k.repos.probes.get(id)).toMatchObject({ state, lastLine: line, lastProbeAt: at(0) });
      expect(k.db.runs.size).toBe(action === 'take' ? 1 : 0);
    });
  }

  it('exit 1 gives probe_failed, also with a valid line, and the next probe can recover', async () => {
    const id = await probeLoop();
    k.commands.reply = () => ({ ...commandOk(SKIP), exitCode: 1 });
    expect(await tickAt(0)).toMatchObject({ probed: [id], failed: [id], errors: [] });
    expect(await k.repos.probes.get(id)).toMatchObject({ state: 'probe_failed', lastLine: 'exit 1', lastProbeAt: at(0) });
    k.commands.reply = () => commandOk(SKIP);
    expect((await tickAt(MIN)).failed).toEqual([]);
    expect((await k.repos.probes.get(id))?.state).toBe('active');
  });

  it('a time-out gives probe_failed, and the stored line names the limit', async () => {
    const id = await probeLoop();
    k.commands.reply = () => ({ exitCode: null, stdout: '', stderr: '', timedOut: true, error: null });
    expect(await tickAt(0)).toMatchObject({ probed: [id], failed: [id] });
    expect(await k.repos.probes.get(id)).toMatchObject({ state: 'probe_failed', lastLine: 'timed out after 30 s' });
    expect(k.db.runs.size).toBe(0);
  });

  it('a bad line gives probe_failed and stores the raw line', async () => {
    const id = await probeLoop();
    k.commands.reply = () => commandOk('all good\n');
    expect(await tickAt(0)).toMatchObject({ probed: [id], failed: [id] });
    expect(await k.repos.probes.get(id)).toMatchObject({ state: 'probe_failed', lastLine: 'all good' });
  });

  it('a finished run probes at once, and with no free lane the console does not call the probe', async () => {
    const id = await probeLoop();
    await tickAt(0);
    k.clock.set(at(10 * SEC));
    await startRun(id);
    expect((await tickAt(20 * SEC)).probed).toEqual([]);

    k.clock.set(at(30 * SEC));
    k.scripted.call(1).succeed();
    await flush();
    expect((await tickAt(31 * SEC)).probed).toEqual([id]);

    k.clock.set(at(32 * SEC));
    await startRun(id);
    expect((await tickAt(10 * MIN)).probed).toEqual([]); // due for 60 s, but the only lane is taken
    expect(k.commands.calls).toHaveLength(2);
  });

  it('a second tick during a hung probe does nothing, and a run that ends during the call gives a new probe', async () => {
    const id = await probeLoop({ maxConcurrent: 2 });
    await startRun(id);
    const hung = deferred();
    k.commands.reply = () => hung.promise;
    const first = tickAt(0);
    await flush();

    expect(await tickAt(SEC)).toEqual({ at: at(SEC), ran: false, probed: [], failed: [], errors: [] });
    expect(k.commands.calls).toHaveLength(1);

    k.clock.set(at(5 * SEC));
    k.scripted.call(1).succeed();
    await flush();
    hung.resolve(commandOk(SKIP));
    await first;
    expect((await k.repos.probes.get(id))?.lastProbeAt).toEqual(at(0));
    k.commands.reply = () => commandOk(SKIP);
    expect((await tickAt(6 * SEC)).probed).toEqual([id]);
  });

  it('an error in one loop stays in the report, and the other loop is probed', async () => {
    const broken = await probeLoop();
    const repo = k.addRepo();
    const healthy = await probeLoop({ repoId: repo.id });
    k.commands.reply = (req) => {
      if (req.cwd === k.repo.path) throw new Error('runner broke');
      return commandOk(SKIP);
    };
    expect(await tickAt(0)).toEqual({ at: at(0), ran: true, probed: [healthy], failed: [], errors: [{ loopId: broken, message: 'runner broke' }] });
    expect((await k.repos.probes.get(healthy))?.lastProbeAt).toEqual(at(0));
    expect((await k.repos.probes.get(broken))?.lastProbeAt).toBeNull();
  });

  it('two loops run in one tick: a hung probe does not hold back the record of the other', async () => {
    const slow = await probeLoop();
    const repo = k.addRepo();
    const fast = await probeLoop({ repoId: repo.id });
    const hung = deferred();
    k.commands.reply = (req) => (req.cwd === k.repo.path ? hung.promise : commandOk(SKIP));
    const tick = tickAt(0);
    await flush();
    expect(k.commands.calls).toHaveLength(2);
    expect((await k.repos.probes.get(fast))?.lastProbeAt).toEqual(at(0));
    expect((await k.repos.probes.get(slow))?.lastProbeAt).toBeNull();

    hung.resolve({ exitCode: null, stdout: '', stderr: '', timedOut: true, error: null });
    const report = await tick;
    expect(report.failed).toEqual([slow]);
    expect([...report.probed].sort()).toEqual([slow, fast].sort());
  });
});
