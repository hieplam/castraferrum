// What ends a claim when the normal order breaks: a claim is on the task and no run came. Each case must still end with no label (goal row G4).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { commandOk } from '../../tests/support/fake-command-runner';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';

const SEC = 1000;
const at = (ms: number) => new Date(T0.getTime() + ms);
const LINE = '{"v":1,"action":"take","tasks":[{"key":"141"}]}';

let k: Kit;
beforeEach(() => {
  k = makeKit();
  k.commands.reply = () => commandOk(LINE);
});

async function probeLoop(): Promise<string> {
  const { id } = await k.loopService.create(k.input());
  await k.probeService.save(id, { command: ['probe'], claim: ['claim', '{key}'], release: ['release', '{key}', '{reason}'] });
  await k.loopService.start(id);
  await flush();
  return id;
}

async function tickAt(ms: number) {
  k.clock.set(at(ms));
  const report = await k.probeService.tick();
  await flush();
  return report;
}

const claims = () => [...k.db.claims.values()];

describe('claims that lost their run', () => {
  it('startClaimed throws: the next tick releases the label as excused, with the reason "run missing"', async () => {
    const id = await probeLoop();
    vi.spyOn(k.runService, 'startClaimed').mockRejectedValueOnce(new Error('database down'));
    const first = await tickAt(0);
    expect(first.errors).toEqual([{ loopId: id, message: 'database down' }]);
    expect(k.claimGateway.labels).toEqual(new Set(['141']));

    k.commands.reply = () => commandOk('{"v":1,"action":"skip"}');
    await tickAt(SEC);
    expect(k.claimGateway.released()).toEqual([{ op: 'release', key: '141', why: { reason: 'run missing', excused: true } }]);
    expect(k.claimGateway.labels.size).toBe(0);
    expect(claims()[0]?.closedAt).toEqual(at(SEC));
  });

  it('a claim that throws keeps its row, and the next tick releases it', async () => {
    await probeLoop();
    k.claimGateway.onClaim = () => {
      throw new Error('Claim of task 141 timed out after 30 s');
    };
    await tickAt(0);
    expect(claims()).toEqual([expect.objectContaining({ closedAt: null })]);
    k.claimGateway.onClaim = () => {};
    k.commands.reply = () => commandOk('{"v":1,"action":"skip"}');
    await tickAt(SEC);
    expect(k.claimGateway.released()).toHaveLength(1);
    expect(claims()[0]?.closeReason).toBe('run missing');
  });

  it('a Stop during the probe call claims nothing', async () => {
    const id = await probeLoop();
    k.commands.reply = async () => {
      await k.loopService.stop(id);
      return commandOk(LINE);
    };
    await tickAt(0);
    expect(claims()).toEqual([]);
    expect(k.claimGateway.calls).toEqual([]);
  });

  it('a Stop during the claim cancels the run, and the next tick releases the label', async () => {
    const id = await probeLoop();
    k.claimGateway.onClaim = () => k.loopService.stop(id).then(() => {});
    await tickAt(0);
    expect([...k.db.runs.values()].map((r) => r.status)).toEqual(['cancelled']);
    await tickAt(SEC);
    expect(k.claimGateway.labels.size).toBe(0);
    expect(claims()[0]?.closeReason).toBe('run cancelled');
  });

  it('the probe of a stopped loop was removed: the row closes, with no command left to run', async () => {
    const id = await probeLoop();
    await tickAt(0);
    await k.loopService.stop(id);
    await flush();
    await k.probeService.remove(id);
    await tickAt(MIN);
    expect(k.claimGateway.released()).toEqual([]);
    expect(claims()[0]).toMatchObject({ closeReason: 'run cancelled', closedAt: at(MIN) });
  });
});
