// Lanes on the probe tick (spec 2.7, decision 24): the slot, the env and the first line of the prompt of a claimed run.
import { beforeEach, describe, expect, it } from 'vitest';
import { claimedLine } from '../../shared/domain/goal-loop';
import { commandOk } from '../../tests/support/fake-command-runner';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';

const at = (ms: number) => new Date(T0.getTime() + ms);
const take = (...keys: string[]) => JSON.stringify({ v: 1, action: 'take', tasks: keys.map((key) => ({ key })) });

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

async function laneLoop(): Promise<string> {
  const { id } = await k.loopService.create(k.input({ maxConcurrent: 3, prompt: 'Do the work' }));
  await k.probeService.save(id, {
    command: ['probe'],
    claim: ['claim', '{key}'],
    release: ['release', '{key}', '{reason}'],
    laneEnv: { LANE_DB: 'loops_lane{slot}_test', LANE_PORT: '{port}' },
    laneBasePort: 7100,
  });
  await k.loopService.start(id);
  await flush();
  return id;
}

async function tickAt(ms: number, ...keys: string[]) {
  k.commands.reply = () => commandOk(take(...keys));
  k.clock.set(at(ms));
  await k.probeService.tick();
  await flush();
}

const runs = () => [...k.db.runs.values()].sort((a, b) => (a.iteration ?? 0) - (b.iteration ?? 0));

describe('lanes on the probe tick', () => {
  it('slots: three tasks in one tick get slots 0, 1 and 2', async () => {
    await laneLoop();
    await tickAt(0, 'a', 'b', 'c');
    expect(runs().map((r) => [r.taskKey, r.slot])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });

  it('input.env: each run gets its own slot, database name and port, and the executor receives them', async () => {
    await laneLoop();
    await tickAt(0, 'a', 'b', 'c');
    const envs = k.scripted.calls.map((c) => c.input.env);
    expect(envs).toEqual([
      { LANE_DB: 'loops_lane0_test', LANE_PORT: '7100', CASTRAFERRUM_SLOT: '0' },
      { LANE_DB: 'loops_lane1_test', LANE_PORT: '7101', CASTRAFERRUM_SLOT: '1' },
      { LANE_DB: 'loops_lane2_test', LANE_PORT: '7102', CASTRAFERRUM_SLOT: '2' },
    ]);
    expect(JSON.stringify([...k.db.runs.values()])).not.toContain('loops_lane'); // the env is not stored
  });

  it('prompt first line: the snapshot is the claimed line, a blank line and the loop prompt', async () => {
    await laneLoop();
    await tickAt(0, 'a');
    const [run] = runs();
    expect(run!.promptSnapshot).toBe(`${claimedLine('a', 'take')}\n\nDo the work`);
    expect(k.scripted.call(1).input.prompt).toBe(run!.promptSnapshot);
  });

  it('no-probe loop unchanged: its runs have no slot, no env and the plain prompt', async () => {
    const { id } = await k.loopService.create(k.input({ prompt: 'Do the work' }));
    await k.loopService.start(id);
    await flush();
    await k.tickAt(at(5 * MIN));
    const all = runs();
    expect(all.length).toBeGreaterThan(0);
    for (const r of all) expect(r).toMatchObject({ slot: null, taskKey: null, promptSnapshot: 'Do the work' });
    expect(all.map((r) => r.trigger)).not.toContain('probe');
    expect(k.scripted.calls.length).toBe(all.filter((r) => r.status !== 'skipped').length);
    expect(k.scripted.calls.length).toBeGreaterThan(0);
    for (const c of k.scripted.calls) {
      expect(c.input.env).toBeUndefined();
      expect(c.input.prompt).toBe('Do the work');
    }
  });

  it('slot 0 reused: when the run of slot 0 ends, the next task takes slot 0 and the run of slot 1 keeps its slot', async () => {
    await laneLoop();
    await tickAt(0, 'a', 'b');
    k.scripted.call(1).succeed();
    await flush();
    await tickAt(2 * MIN, 'c');
    expect(runs().map((r) => [r.taskKey, r.slot, r.status])).toEqual([
      ['a', 0, 'succeeded'],
      ['b', 1, 'running'],
      ['c', 0, 'running'],
    ]);
    expect(k.scripted.call(3).input.env).toMatchObject({ CASTRAFERRUM_SLOT: '0', LANE_PORT: '7100' });
  });
});
