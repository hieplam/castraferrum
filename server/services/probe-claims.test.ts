// Claim, start, release on the tick (spec 2.3, 2.4, decision 23). Time comes only from the wound clock, and the labels sit in the fake gateway.
import { beforeEach, describe, expect, it } from 'vitest';
import { commandOk } from '../../tests/support/fake-command-runner';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';

const SEC = 1000;
const at = (ms: number) => new Date(T0.getTime() + ms);
const take = (...keys: string[]) => JSON.stringify({ v: 1, action: 'take', tasks: keys.map((key) => ({ key })) });
const SKIP = '{"v":1,"action":"skip"}';

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

async function probeLoop(over: Parameters<Kit['input']>[0] = {}): Promise<string> {
  const { id } = await k.loopService.create(k.input(over));
  await k.probeService.save(id, { command: ['probe'], claim: ['claim', '{key}'], release: ['release', '{key}', '{reason}'] });
  await k.loopService.start(id);
  await flush();
  return id;
}

function offer(...keys: string[]) {
  k.commands.reply = () => commandOk(keys.length ? take(...keys) : SKIP);
}

async function tickAt(ms: number) {
  k.clock.set(at(ms));
  const report = await k.probeService.tick();
  await flush();
  return report;
}

const runs = () => [...k.db.runs.values()];
const claims = () => [...k.db.claims.values()];
const open = () => claims().filter((c) => c.closedAt === null);
const running = (loopId: string) => runs().filter((r) => r.loopId === loopId && r.status === 'running');

/** A loop whose only task runs: run #1 of the scripted executor, claim open. */
async function oneTaskRunning() {
  const id = await probeLoop();
  offer('141');
  await tickAt(0);
  expect(k.claimGateway.labels).toEqual(new Set(['141']));
  offer();
  return id;
}

describe('claims on the probe tick', () => {
  it('order: the row exists before the claim, and the run comes after the claim', async () => {
    const id = await probeLoop();
    offer('141');
    const seen: unknown[] = [];
    k.claimGateway.onClaim = () => void seen.push({ rows: open().length, runs: runs().length });
    await tickAt(0);

    expect(seen).toEqual([{ rows: 1, runs: 0 }]);
    const [run] = runs();
    expect(run).toMatchObject({ loopId: id, trigger: 'probe', taskKey: '141', status: 'running' });
    expect(claims()).toEqual([expect.objectContaining({ loopId: id, taskKey: '141', runId: run!.id, openedAt: at(0), closedAt: null })]);
    expect(k.scripted.calls).toHaveLength(1);
  });

  it('lanes cap: three ready tasks on two free lanes start two runs, and the third is not touched', async () => {
    const id = await probeLoop({ maxConcurrent: 3 });
    const open0 = await k.repos.executions.findOpen(id);
    await k.runService.startFirst(id, open0!.id);
    await flush();
    offer('141', '142', '143');
    await tickAt(0);

    expect(running(id)).toHaveLength(3);
    expect(k.claimGateway.claimed()).toEqual(['141', '142']);
    expect(k.claimGateway.labels).toEqual(new Set(['141', '142']));
    expect(open().map((c) => c.taskKey).sort()).toEqual(['141', '142']);
  });

  it('taken: a task whose claim is open gets no second claim and no second run, and the next task goes on', async () => {
    const id = await probeLoop({ maxConcurrent: 2 });
    offer('141');
    await tickAt(0);
    offer('141', '142');
    await tickAt(MIN);

    expect(k.claimGateway.claimed()).toEqual(['141', '142']);
    expect(running(id).map((r) => r.taskKey)).toEqual(['141', '142']);
  });

  it('refused: the row closes with the reason, no session starts, and no release runs', async () => {
    await probeLoop();
    offer('141');
    k.claimGateway.refuse.set('141', 'already claimed');
    k.clock.set(at(0));
    await tickAt(0);

    expect(claims()).toEqual([expect.objectContaining({ taskKey: '141', closedAt: at(0), closeReason: 'refused: already claimed' })]);
    expect(runs()).toEqual([]);
    expect(k.scripted.calls).toEqual([]);
    expect(k.claimGateway.released()).toEqual([]);
  });

  it('next task after refused: the free lane goes to the next ready task', async () => {
    const id = await probeLoop();
    offer('141', '142');
    k.claimGateway.refuse.set('141', 'no');
    await tickAt(0);

    expect(k.claimGateway.claimed()).toEqual(['141', '142']);
    expect(running(id).map((r) => r.taskKey)).toEqual(['142']);
  });

  it('lanes full: the probe is not called, and nothing is claimed', async () => {
    await oneTaskRunning();
    k.commands.calls.length = 0;
    offer('142');
    await tickAt(MIN);

    expect(k.commands.calls).toEqual([]);
    expect(k.claimGateway.claimed()).toEqual(['141']);
    expect(runs()).toHaveLength(1);
  });

  it('succeeded: one tick closes the claim and releases the label, and no attempt is excused', async () => {
    await oneTaskRunning();
    k.scripted.call(1).succeed();
    await flush();
    expect(k.claimGateway.labels.size).toBe(1);
    await tickAt(SEC);

    expect(k.claimGateway.labels.size).toBe(0);
    expect(k.claimGateway.released()).toEqual([{ op: 'release', key: '141', why: { reason: 'run succeeded', excused: false } }]);
    expect(claims()[0]).toMatchObject({ closedAt: at(SEC), closeReason: 'run succeeded' });
  });

  it('failed: the release says so, and it is not excused', async () => {
    await oneTaskRunning();
    k.scripted.call(1).fail('boom');
    await flush();
    await tickAt(SEC);
    expect(k.claimGateway.released()).toEqual([{ op: 'release', key: '141', why: { reason: 'run failed', excused: false } }]);
  });

  it('cancelled: a Stop releases the label of its run on the next tick, also though the loop is stopped', async () => {
    const id = await oneTaskRunning();
    await k.loopService.stop(id);
    await flush();
    await tickAt(SEC);

    expect(k.db.loops.get(id)?.status).toBe('stopped');
    expect(k.claimGateway.labels.size).toBe(0);
    expect(claims()[0]).toMatchObject({ closeReason: 'run cancelled' });
    expect(k.claimGateway.released()[0]?.why.excused).toBe(false);
  });

  it('interrupted: a restart gives an excused release', async () => {
    await oneTaskRunning();
    await k.repos.runs.markAllRunningInterrupted(at(SEC));
    await tickAt(2 * SEC);
    expect(k.claimGateway.released()).toEqual([{ op: 'release', key: '141', why: { reason: 'run interrupted', excused: true } }]);
  });

  it('RESOURCE_DOWN: the end word goes into the reason, and the release is excused', async () => {
    await oneTaskRunning();
    await k.repos.runs.finish(runs()[0]!.id, { status: 'succeeded', finishedAt: at(SEC), endResult: 'RESOURCE_DOWN' });
    await tickAt(2 * SEC);
    expect(k.claimGateway.released()).toEqual([{ op: 'release', key: '141', why: { reason: 'run succeeded RESOURCE_DOWN', excused: true } }]);
  });

  it('PR_OPEN with no gate: a plain release, not excused', async () => {
    await oneTaskRunning();
    await k.repos.runs.finish(runs()[0]!.id, { status: 'succeeded', finishedAt: at(SEC), endResult: 'PR_OPEN', endPr: 'https://x/pull/7' });
    await tickAt(2 * SEC);
    expect(k.claimGateway.released()).toEqual([{ op: 'release', key: '141', why: { reason: 'run succeeded PR_OPEN', excused: false } }]);
  });

  it('running stays: a claim keeps its label while its run goes on', async () => {
    await oneTaskRunning();
    await tickAt(30 * MIN);
    expect(k.claimGateway.released()).toEqual([]);
    expect(open()).toHaveLength(1);
  });

  it('a failed release keeps the row open, and the tick tries again at +60 s, not before', async () => {
    await oneTaskRunning();
    k.scripted.call(1).succeed();
    await flush();
    k.claimGateway.releaseError = 'gh: 502';

    const failed = await tickAt(SEC);
    expect(failed.errors).toEqual([{ loopId: claims()[0]!.loopId, message: 'gh: 502' }]);
    expect(open()).toHaveLength(1);
    await tickAt(SEC + 59 * SEC);
    expect(k.claimGateway.released()).toHaveLength(1);

    k.claimGateway.releaseError = null;
    await tickAt(SEC + 60 * SEC);
    expect(k.claimGateway.released()).toHaveLength(2);
    expect(open()).toEqual([]);
    expect(k.claimGateway.labels.size).toBe(0);
  });

  it('skipped: a run that finds no lane at the start gives an excused release and a close on the same tick', async () => {
    const id = await probeLoop();
    offer('141');
    // Another start takes the lane after the lanes were counted.
    k.claimGateway.onClaim = async () => {
      const execution = await k.repos.executions.findOpen(id);
      await k.runService.startFirst(id, execution!.id);
    };
    await tickAt(0);

    expect(runs().find((r) => r.status === 'skipped')).toMatchObject({ trigger: 'probe', taskKey: '141' });
    expect(k.claimGateway.released()).toEqual([{ op: 'release', key: '141', why: { reason: 'run skipped', excused: true } }]);
    expect(open()).toEqual([]);
    expect(running(id)).toHaveLength(1);
  });

  it('no probe row: a plain loop keeps its cron and first run, and the tick claims nothing', async () => {
    const { id } = await k.loopService.create(k.input());
    const started = await k.loopService.start(id);
    await flush();
    expect(started.nextRunAt).toEqual(at(5 * MIN));
    k.scripted.call(1).succeed();
    await flush();
    await tickAt(MIN);
    expect((await k.tickAt(at(5 * MIN))).started).toHaveLength(1);

    expect(runs().map((r) => [r.trigger, r.taskKey])).toEqual([
      ['start', null],
      ['schedule', null],
    ]);
    expect(claims()).toEqual([]);
    expect(k.claimGateway.calls).toEqual([]);
    expect(k.commands.calls).toEqual([]);
  });

  it('next task one tick after a run ends: no 60 s wait and no cron', async () => {
    const id = await oneTaskRunning();
    k.clock.set(at(SEC));
    k.scripted.call(1).succeed();
    await flush();
    offer('142');
    await tickAt(2 * SEC);

    expect(k.claimGateway.labels).toEqual(new Set(['142']));
    expect(running(id).map((r) => r.taskKey)).toEqual(['142']);
  });

  it('busy tick: while a claim hangs, a second tick drops out, so one task cannot start twice', async () => {
    const id = await probeLoop();
    offer('141');
    let answer!: () => void;
    k.claimGateway.onClaim = () => new Promise<void>((r) => (answer = r));
    k.clock.set(at(0));
    const first = k.probeService.tick();
    await flush();

    expect((await tickAt(MIN)).ran).toBe(false);
    answer();
    await first;
    await flush();
    expect(k.claimGateway.claimed()).toEqual(['141']);
    expect(running(id)).toHaveLength(1);
  });
});
