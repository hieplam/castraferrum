// Rank and budget (spec 2.14, rules 6 and 12): the pure rule, then ProbeService.tick on a fake plan window, with a wound clock.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProbeRecord } from '../../shared/domain/goal-loop';
import { commandOk } from '../../tests/support/fake-command-runner';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';
import { higherRankLive, mayStart } from './rank';

const SEC = 1000;
const TAKE = '{"v":1,"action":"take","tasks":[{"key":"t1"}]}';
const PLAN = '{"v":1,"action":"plan","plan":{"key":"goal"}}';
const SKIP = '{"v":1,"action":"skip"}';
const at = (ms: number) => new Date(T0.getTime() + ms);

const liveLoop = { id: 'high', status: 'active' as const, archivedAt: null };
const self = { rank: 100 };
const probe = (over: Partial<ProbeRecord> = {}): ProbeRecord => ({
  loopId: 'high',
  command: ['probe'],
  claim: [],
  release: [],
  resources: [],
  laneEnv: {},
  laneBasePort: null,
  restartPolicy: 'stop',
  rank: 10,
  tokenBudget: null,
  state: 'active',
  lastLine: TAKE,
  lastProbeAt: null,
  ...over,
});
/** The rule with a higher loop live: `window` and how long until the reset. */
const start = (utilization: number | null, resetsInMs: number | null) =>
  mayStart({ higherLive: true, now: T0, window: { utilization, resetsAt: resetsInMs === null ? null : at(resetsInMs) } });

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

/** A started loop whose probe command is `['probe', <name>]`, so a reply can answer each loop. */
async function rankedLoop(name: string, rank?: number, tokenBudget?: number | null): Promise<string> {
  const { id } = await k.loopService.create(k.input({ name }));
  await k.probeService.save(id, { command: ['probe', name], ...(rank === undefined ? {} : { rank }), ...(tokenBudget === undefined ? {} : { tokenBudget }) });
  await k.loopService.start(id);
  await flush();
  return id;
}

async function tickAt(ms: number, lines: Record<string, string>) {
  k.commands.reply = (req) => commandOk(lines[req.argv[1]!] ?? SKIP);
  k.clock.set(at(ms));
  await k.probeService.tick();
  await flush();
}

const probed = () => k.commands.calls.filter((c) => c.argv[0] === 'probe').map((c) => c.argv[1]);
const runsOf = (loopId: string) => [...k.db.runs.values()].filter((r) => r.loopId === loopId);

describe('rank', () => {
  it('no higher loop live: the run starts with no window read', () => {
    expect(higherRankLive(self, [probe({ rank: 100 })], [liveLoop])).toBe(false);
    expect(mayStart({ higherLive: false, window: null, now: T0 })).toBe(true);
  });

  it('a higher `take` with a null window refuses', () => {
    expect(higherRankLive(self, [probe({ lastLine: TAKE })], [liveLoop])).toBe(true);
    expect(mayStart({ higherLive: true, window: null, now: T0 })).toBe(false);
    expect(start(null, null)).toBe(false);
  });

  it('a higher `plan` refuses, in the middle of the window', () => {
    expect(higherRankLive(self, [probe({ lastLine: PLAN })], [liveLoop])).toBe(true);
    expect(start(10, 3 * 60 * MIN)).toBe(false);
  });

  it('44 min from the reset and 89 % used starts', () => {
    expect(start(89, 44 * MIN)).toBe(true);
  });

  it('exactly 45 min from the reset refuses', () => {
    expect(start(10, 45 * MIN)).toBe(false);
    expect(start(10, 45 * MIN - 1)).toBe(true);
  });

  it('exactly 90 % used refuses', () => {
    expect(start(90, 10 * MIN)).toBe(false);
  });

  it('a null `resetsAt` refuses, and a null `utilization` refuses', () => {
    expect(start(10, null)).toBe(false);
    expect(start(null, 10 * MIN)).toBe(false);
  });

  it('a higher `skip` does not count', () => {
    expect(higherRankLive(self, [probe({ lastLine: SKIP })], [liveLoop])).toBe(false);
    expect(higherRankLive(self, [probe({ lastLine: null })], [liveLoop])).toBe(false);
    expect(higherRankLive(self, [probe({ lastLine: 'exit 1' })], [liveLoop])).toBe(false);
  });

  it('an equal rank does not count', () => {
    expect(higherRankLive(self, [probe({ rank: 100 })], [liveLoop])).toBe(false);
    expect(higherRankLive(self, [probe({ rank: 99 })], [liveLoop])).toBe(true);
  });

  it('the older low-rank loop waits and the high rank starts, also when both print `take` in one tick', async () => {
    const low = await rankedLoop('low', 200);
    const high = await rankedLoop('high', 10);
    k.planWindow.value = { utilization: 10, resetsAt: at(3 * 60 * MIN) };

    await tickAt(0, { low: TAKE, high: TAKE });

    expect(runsOf(high)).toHaveLength(1);
    expect(runsOf(low)).toHaveLength(0);
    expect(k.planWindow.reads).toBe(1);
  });

  it('the refused loop gets 0 probe calls, and a refused rank records nothing', async () => {
    const low = await rankedLoop('low', 200);
    const high = await rankedLoop('high', 10);
    await tickAt(0, { high: TAKE, low: SKIP }); // the high rank goes first, and `low` is refused before its call
    expect(k.commands.calls.map((c) => c.argv[1])).toEqual(['high']);

    await tickAt(MIN, { high: TAKE, low: TAKE });

    expect(probed()).toEqual(['high']);
    expect(runsOf(low)).toHaveLength(0);
    expect(await k.repos.probes.get(low)).toMatchObject({ state: 'active', lastLine: null, lastProbeAt: null });
    expect(k.planWindow.reads).toBe(2);
    expect(runsOf(high)).toHaveLength(1); // its lane is busy from the first tick, so the second tick starts no run
  });

  it('a stopped higher loop does not count, in the rule and on the tick', async () => {
    const low = await rankedLoop('low', 200);
    const high = await rankedLoop('high', 10);
    await tickAt(0, { high: TAKE, low: TAKE });
    expect(runsOf(low)).toHaveLength(0);
    await k.loopService.stop(high);
    await flush();
    const reads = k.planWindow.reads;

    await tickAt(MIN, { low: TAKE });

    expect(runsOf(low)).toHaveLength(1);
    expect(k.planWindow.reads).toBe(reads);
    expect(higherRankLive(self, [probe()], [{ ...liveLoop, status: 'stopped' }])).toBe(false);
    expect(higherRankLive(self, [probe()], [{ ...liveLoop, archivedAt: T0 }])).toBe(false);
  });

  it('a reached budget gives `budget_limited`, keeps the line, gives 0 calls and 0 runs, and the loop no longer stops a lower rank', async () => {
    const high = await rankedLoop('high', 10, 1000);
    const low = await rankedLoop('low', 200);
    await tickAt(0, { high: TAKE, low: SKIP });
    k.scripted.call(1).succeedWithTokens(1000);
    await k.runService.settled();
    await tickAt(MIN, { high: TAKE, low: SKIP }); // the run ended: the high rank is due, and at its budget
    const calls = k.commands.calls.length;

    expect(await k.repos.probes.get(high)).toMatchObject({ state: 'budget_limited', lastLine: TAKE });
    expect(probed().filter((n) => n === 'high')).toHaveLength(1);
    expect(runsOf(high)).toHaveLength(1);

    await tickAt(2 * MIN, { low: TAKE });

    expect(k.commands.calls.slice(calls).map((c) => c.argv[1])).toEqual(['low']);
    expect(runsOf(low)).toHaveLength(1);
    expect(runsOf(high)).toHaveLength(1);
  });

  it('a null budget never limits', async () => {
    const id = await rankedLoop('solo');
    await tickAt(0, { solo: TAKE });
    k.scripted.call(1).succeedWithTokens(1_000_000);
    await k.runService.settled();

    await tickAt(MIN, { solo: SKIP });

    expect(await k.repos.runs.sumTokens(id)).toBe(1_000_000);
    expect(await k.repos.probes.get(id)).toMatchObject({ state: 'active', lastLine: SKIP });
    expect(probed()).toEqual(['solo', 'solo']);
  });

  it('all at rank 100 gives 0 window reads and the same runs', async () => {
    const a = await rankedLoop('a');
    const b = await rankedLoop('b');

    await tickAt(0, { a: TAKE, b: TAKE });
    await tickAt(61 * SEC, { a: TAKE, b: TAKE });

    expect(k.planWindow.reads).toBe(0);
    expect(runsOf(a)).toHaveLength(1);
    expect(runsOf(b)).toHaveLength(1);
    expect((await k.repos.probes.get(a))?.rank).toBe(100);
  });
});
