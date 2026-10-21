// Scheduler tick tests: only `tick()` creates scheduled runs, skips on overlap and cancels overdue runs.
import { beforeEach, describe, expect, it } from 'vitest';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';

const at = (ms: number) => new Date(T0.getTime() + ms);

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

async function startedLoop(over: Parameters<Kit['input']>[0] = {}) {
  const loop = await k.loopService.create(k.input(over));
  await k.loopService.start(loop.id);
  await flush();
  return loop;
}

describe('SchedulingService.tick', () => {
  it('cron mark not reached → no run; mark reached → a trigger schedule run with scheduledFor = the mark, the next run = the following mark', async () => {
    const loop = await startedLoop();
    k.scripted.call(1).succeed();
    await flush();
    expect((await k.tickAt(at(5 * MIN - 1))).started).toEqual([]);
    const r = await k.tickAt(at(5 * MIN));
    expect(r.started).toHaveLength(1);
    expect(k.db.runs.get(r.started[0]!)).toMatchObject({ iteration: 2, trigger: 'schedule', scheduledFor: at(5 * MIN), status: 'running' });
    expect(k.db.loops.get(loop.id)?.nextRunAt).toEqual(at(10 * MIN));
    expect((await k.tickAt(at(5 * MIN + 1000))).started).toEqual([]); // the same mark does not run twice
  });

  describe('UC-12 skip on overlapping runs', () => {
    it('UC-12 a tick arrives while the previous run is still going → a skipped run "round #1 still running", never two running runs of the same loop', async () => {
      const loop = await startedLoop();
      const r1 = await k.tickAt(at(5 * MIN));
      const r2 = await k.tickAt(at(10 * MIN));
      expect(r1.skipped).toHaveLength(1);
      expect(r2.skipped).toHaveLength(1);
      expect(k.runningCount()).toBe(1);
      const skipped = [...k.db.runs.values()].filter((r) => r.status === 'skipped');
      expect(skipped.map((r) => [r.iteration, r.skipReason, r.sessionId, r.scheduledFor])).toEqual([
        [null, 'round #1 still running', null, at(5 * MIN)],
        [null, 'round #1 still running', null, at(10 * MIN)],
      ]);
      expect(k.scripted.calls).toHaveLength(1); // the executor is not called for a skipped run
      expect(k.db.loops.get(loop.id)).toMatchObject({ status: 'active', runCounter: 1, nextRunAt: at(15 * MIN) });
      expect(k.eventsOf('run.skipped')).toMatchObject([{ reason: 'round #1 still running' }, { reason: 'round #1 still running' }]);

      k.scripted.call(1).succeed();
      await flush();
      const r3 = await k.tickAt(at(15 * MIN));
      expect(r3.started).toHaveLength(1);
      expect(k.db.runs.get(r3.started[0]!)?.iteration).toBe(2);
    });

    it('UC-12 the first run of Start runs longer than the cron interval → every tick in between is skipped', async () => {
      await startedLoop({ cron: '* * * * *' });
      for (let m = 1; m <= 4; m++) await k.tickAt(at(m * MIN));
      expect([...k.db.runs.values()].map((r) => r.status)).toEqual(['running', 'skipped', 'skipped', 'skipped', 'skipped']);
    });
  });

  describe('UC-13 timeout', () => {
    it('UC-13 a run exceeding timeoutSec → timed_out, the executor receives the signal; the loop keeps going, the next tick runs normally', async () => {
      const loop = await startedLoop({ timeoutSec: 120, cron: '*/5 * * * *' });
      expect((await k.tickAt(at(2 * MIN - 1))).timedOut).toBe(0);
      const r = await k.tickAt(at(2 * MIN));
      expect(r.timedOut).toBe(1);
      const first = [...k.db.runs.values()][0]!;
      expect(first).toMatchObject({ status: 'timed_out', finishedAt: at(2 * MIN), durationMs: 2 * MIN, error: 'Timed out (120 seconds) - cancelled' });
      expect(k.scripted.call(1).signal.reason).toBe('timed_out');
      await flush();
      expect(k.scripted.call(1).ended).toBe(true);
      expect(k.db.loops.get(loop.id)?.status).toBe('active');

      const next = await k.tickAt(at(5 * MIN));
      expect(next.started).toHaveLength(1);
      k.scripted.call(2).succeed();
      await flush();
      expect([...k.db.runs.values()].map((x) => [x.iteration, x.status])).toEqual([
        [1, 'timed_out'],
        [2, 'succeeded'],
      ]);
      const stats = (await k.loopService.get(loop.id)).currentExecution?.stats;
      expect(stats).toMatchObject({ runs: 2, succeeded: 1, failed: 1 }); // timed_out counts in the error group
    });

    it('UC-13 an executor that ignores the signal → the run is still timed_out in the DB, the late result is dropped', async () => {
      k.scripted.ignoreSignal = true;
      await startedLoop({ timeoutSec: 60 });
      await k.tickAt(at(MIN));
      k.scripted.call(1).succeed();
      await flush();
      expect([...k.db.runs.values()][0]).toMatchObject({ status: 'timed_out' });
    });
  });

  it('machine sleeps 3 hours then wakes (the clock jumps) → only ONE run, the next run is computed from wake-up time', async () => {
    const loop = await startedLoop();
    k.scripted.call(1).succeed();
    await flush();
    const r = await k.tickAt(at(3 * 60 * MIN + 2 * MIN)); // 11:02
    expect(r.started).toHaveLength(1);
    expect(k.db.runs.get(r.started[0]!)?.scheduledFor).toEqual(at(5 * MIN)); // the missed mark
    expect(k.db.loops.get(loop.id)?.nextRunAt).toEqual(at(3 * 60 * MIN + 5 * MIN)); // 11:05, not piled up
    expect(k.db.runs.size).toBe(2);
  });

  it('a heartbeat every 10 seconds (recovery takes it as the server shutdown time)', async () => {
    expect((await k.tickAt(at(0))).heartbeat).toBe(true);
    expect((await k.tickAt(at(9_000))).heartbeat).toBe(false);
    expect((await k.tickAt(at(10_000))).heartbeat).toBe(true);
    expect(k.db.heartbeat).toEqual(at(10_000));
  });

  it('previous tick not finished → an overlapping tick does nothing (ran = false)', async () => {
    await startedLoop();
    k.clock.set(at(5 * MIN));
    const [a, b] = await Promise.all([k.scheduling.tick(), k.scheduling.tick()]);
    expect([a.ran, b.ran]).toEqual([true, false]);
    expect(a.skipped.length + a.started.length).toBe(1);
  });

  it('one loop with an unexpected error does not block other loops on the same tick', async () => {
    const bad = await startedLoop({ name: 'broken' });
    const good = await startedLoop({ name: 'good' });
    k.scripted.call(1).succeed();
    k.scripted.call(2).succeed();
    await flush();
    k.db.writeLoop({ ...k.db.loops.get(bad.id)!, timezone: 'Broken/Invalid' }); // inconsistent data: the time zone is no longer valid
    const r = await k.tickAt(at(5 * MIN));
    expect(r.errors).toMatchObject([{ loopId: bad.id }]);
    expect(r.started.map((id) => k.db.runs.get(id)?.loopId)).toEqual([good.id]);
  });

  it('UC-16 10 loops at once: one run per loop in parallel, each loop\'s stats correct', async () => {
    const loops = [];
    for (let i = 0; i < 10; i++) loops.push(await startedLoop({ name: `L${i}` }));
    expect(k.runningCount()).toBe(10); // the 10 first runs of Start run in parallel
    expect(k.active.size()).toBe(10);
    // even loops succeed, odd loops fail
    k.scripted.calls.forEach((c, i) => (i % 2 === 0 ? c.succeed() : c.fail()));
    await flush();
    const r = await k.tickAt(at(5 * MIN));
    expect(r.started).toHaveLength(10); // all 10 loops are due on the same tick
    expect(k.runningCount()).toBe(10);
    k.clock.set(at(6 * MIN));
    const views = await k.loopService.list({});
    for (const v of views) {
      const i = Number(v.name.slice(1));
      expect(v.currentExecution?.stats).toMatchObject({
        runs: 2,
        running: 1,
        succeeded: i % 2 === 0 ? 1 : 0,
        failed: i % 2 === 0 ? 0 : 1,
        elapsedMs: 6 * MIN,
      });
      expect(v.activeRun?.iteration).toBe(2);
    }
    expect(new Set([...k.db.runs.values()].map((x) => x.sessionId)).size).toBe(20);
  });
});

describe('up to N parallel runs', () => {
  const statuses = () => [...k.db.runs.values()].map((r) => [r.iteration, r.status]);

  it('(s1) N = 3: the Start run + 2 ticks → 3 running runs at once; the 3rd tick → skipped "3 parallel runs already going (rounds #1, #2, #3 still running)"', async () => {
    const loop = await startedLoop({ maxConcurrent: 3, cron: '* * * * *' });
    expect((await k.tickAt(at(1 * MIN))).started).toHaveLength(1);
    expect((await k.tickAt(at(2 * MIN))).started).toHaveLength(1);
    expect(k.runningCount()).toBe(3);
    expect(k.scripted.calls).toHaveLength(3); // three sessions really run in parallel
    const r = await k.tickAt(at(3 * MIN));
    expect(r.skipped).toHaveLength(1);
    expect(k.db.runs.get(r.skipped[0]!)?.skipReason).toBe('3 parallel runs already going (rounds #1, #2, #3 still running)');
    expect(k.runningCount()).toBe(3);
    const v = await k.loopService.get(loop.id);
    expect(v.maxConcurrent).toBe(3);
    expect(v.activeRuns.map((x) => x.iteration)).toEqual([3, 2, 1]); // newest first
    expect(v.activeRun?.iteration).toBe(3);
    expect(v.currentExecution?.stats).toMatchObject({ running: 3, skipped: 1 });
  });

  it('(s2) lowering N 3 → 2 while 3 runs are going: none is cancelled, all 3 run to the end; ≥ 2 left → skip, 1 left → open a new run', async () => {
    const loop = await startedLoop({ maxConcurrent: 3, cron: '* * * * *' });
    await k.tickAt(at(1 * MIN));
    await k.tickAt(at(2 * MIN));
    const cur = await k.loopService.get(loop.id);
    await k.loopService.update(loop.id, k.input({ name: cur.name, maxConcurrent: 2, cron: '* * * * *' }), cur.version);
    await flush();
    expect(k.runningCount()).toBe(3);
    expect(k.scripted.calls.map((c) => c.signal.aborted)).toEqual([false, false, false]); // no run is cancelled
    const s1 = await k.tickAt(at(3 * MIN));
    expect(k.db.runs.get(s1.skipped[0]!)?.skipReason).toBe('2 parallel runs already going (rounds #1, #2, #3 still running)');

    k.scripted.call(1).succeed();
    await flush();
    const s2 = await k.tickAt(at(4 * MIN)); // 2 left = N → still skipped
    expect(k.db.runs.get(s2.skipped[0]!)?.skipReason).toBe('2 parallel runs already going (rounds #2, #3 still running)');

    k.scripted.call(2).succeed();
    await flush();
    const s3 = await k.tickAt(at(5 * MIN)); // 1 left < 2 → open a new run
    expect(s3.started).toHaveLength(1);
    expect(k.db.runs.get(s3.started[0]!)?.iteration).toBe(4);
    k.scripted.call(3).succeed();
    await flush();
    expect(statuses().filter(([, st]) => st === 'cancelled')).toEqual([]);
    expect(statuses().filter(([i]) => i !== null)).toEqual([
      [1, 'succeeded'],
      [2, 'succeeded'],
      [3, 'succeeded'],
      [4, 'running'],
    ]);
  });

  it('(s2b) raising N 1 → 2 while running → the next tick opens another run', async () => {
    const loop = await startedLoop({ cron: '* * * * *' });
    expect((await k.tickAt(at(1 * MIN))).skipped).toHaveLength(1);
    const cur = await k.loopService.get(loop.id);
    await k.loopService.update(loop.id, k.input({ name: cur.name, maxConcurrent: 2, cron: '* * * * *' }), cur.version);
    expect((await k.tickAt(at(2 * MIN))).started).toHaveLength(1);
    expect(k.runningCount()).toBe(2);
  });

  it('(s3) Stop with 3 running runs → all 3 cancelled, each run gets one log line "Cancelled (Stop)"; the executor receives the abort signal', async () => {
    const loop = await startedLoop({ maxConcurrent: 3, cron: '* * * * *' });
    await k.tickAt(at(1 * MIN));
    await k.tickAt(at(2 * MIN));
    const v = await k.loopService.stop(loop.id);
    await flush();
    expect(v.activeRuns).toEqual([]);
    expect(v.activeRun).toBeNull();
    expect(statuses()).toEqual([
      [1, 'cancelled'],
      [2, 'cancelled'],
      [3, 'cancelled'],
    ]);
    expect(k.scripted.calls.map((c) => c.signal.aborted)).toEqual([true, true, true]);
    for (const r of k.db.runs.values()) expect(k.db.logs.get(r.id)?.map((l) => l.message)).toContain('Cancelled (Stop)');
    expect(k.active.size()).toBe(0);
  });

  it('(s4) maxConcurrent 0 / 11 / 1.5 → VALIDATION_FAILED on the maxConcurrent field; empty / null → 1', async () => {
    for (const bad of [0, 11, 1.5]) {
      await expect(k.loopService.create(k.input({ maxConcurrent: bad }))).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { issues: [{ field: 'maxConcurrent', code: 'outOfRange' }] },
      });
    }
    expect((await k.loopService.create(k.input())).maxConcurrent).toBe(1);
    expect((await k.loopService.create(k.input({ maxConcurrent: null }))).maxConcurrent).toBe(1);
    expect((await k.loopService.create(k.input({ maxConcurrent: 10 }))).maxConcurrent).toBe(10);
  });

  it('(s5) duplicating keeps maxConcurrent', async () => {
    const src = await k.loopService.create(k.input({ maxConcurrent: 4 }));
    expect((await k.loopService.duplicate(src.id)).maxConcurrent).toBe(4);
  });
});
