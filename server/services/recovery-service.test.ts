// Restart tests (UC-15): "new process" = a new set of services on the same MemoryDb; the old set counts as dead.
import { describe, expect, it } from 'vitest';
import { OffsetClock } from '../adapters/clock/offset-clock';
import { flush, makeKit, MIN, T0 } from '../../tests/support/service-kit';

const at = (ms: number) => new Date(T0.getTime() + ms);

/**
 * The old process: 2 running loops (one with an unfinished run), 1 stopped loop; the schedule is hourly so the first 7 minutes only have
 * the first run of Start. Last heartbeat at 08:07:30, the server dies at 08:07:35.
 */
async function crashedServer() {
  const old = makeKit();
  const hourly = { cron: '0 * * * *' };
  const busy = await old.loopService.create(old.input({ name: 'has a run', ...hourly }));
  const idle = await old.loopService.create(old.input({ name: 'has no run', ...hourly }));
  const stopped = await old.loopService.create(old.input({ name: 'stopped', ...hourly }));
  await old.loopService.start(busy.id);
  await old.loopService.start(idle.id);
  await old.loopService.start(stopped.id);
  await flush();
  old.scripted.call(2).succeed();
  old.scripted.call(3).succeed();
  await flush();
  old.clock.set(at(MIN));
  await old.loopService.stop(stopped.id);
  for (let s = 0; s <= 450; s += 10) await old.tickAt(at(s * 1000)); // a heartbeat every 10 seconds up to 08:07:30
  old.clock.set(at(7 * MIN + 35_000));
  return { old, busy, idle, stopped };
}

describe('RecoveryService', () => {
  it('UC-15 restart: unfinished run → interrupted, open execution → server_down at the last heartbeat, every loop Stopped, no new run until Start', async () => {
    const { old, busy, idle, stopped } = await crashedServer();
    const before = structuredClone([...old.db.loops.values()].map((l) => [l.name, l.prompt, l.cron, l.version]));

    const boot = makeKit({ db: old.db, clock: new OffsetClock(() => at(20 * MIN).getTime()) }); // back up at 08:20
    const report = await boot.recovery.recover();
    expect(report).toEqual({
      at: at(20 * MIN),
      lastHeartbeatAt: at(450_000),
      interruptedRuns: 1,
      closedExecutions: 2,
      stoppedLoops: 2,
    });

    const busyRun = [...boot.db.runs.values()].find((r) => r.loopId === busy.id && r.iteration === 1)!;
    expect(busyRun).toMatchObject({ status: 'interrupted', finishedAt: at(20 * MIN), sessionId: 'scripted-1', durationMs: 450_000 }); // ran until the last heartbeat, the time the server was down does not count
    const execs = [...boot.db.executions.values()];
    for (const loop of [busy, idle]) {
      expect(execs.find((e) => e.loopId === loop.id)).toMatchObject({ endReason: 'server_down', endedAt: at(450_000) });
    }
    expect(execs.find((e) => e.loopId === stopped.id)).toMatchObject({ endReason: 'stopped', endedAt: at(MIN) });
    // endedAt is off by at most 10 seconds from the real shutdown (08:07:35)
    expect(at(7 * MIN + 35_000).getTime() - at(450_000).getTime()).toBeLessThanOrEqual(10_000);

    // loops, config and history are intact; every loop Stopped
    expect([...boot.db.loops.values()].map((l) => [l.name, l.prompt, l.cron, l.version])).toEqual(before);
    expect([...boot.db.loops.values()].map((l) => [l.status, l.nextRunAt])).toEqual([
      ['stopped', null],
      ['stopped', null],
      ['stopped', null],
    ]);
    const runsBefore = boot.db.runs.size;

    // the new process runs scheduler ticks across several cron marks → no new run
    for (let m = 20; m <= 125; m += 5) await boot.tickAt(at(m * MIN)); // past the 09:00 and 10:00 marks
    expect(boot.db.runs.size).toBe(runsBefore);
    expect(boot.scripted.calls).toHaveLength(0);

    // a late result from the old process (an executor "coming back to life") does not overwrite interrupted
    old.scripted.call(1).succeed();
    await flush();
    expect(boot.db.runs.get(busyRun.id)?.status).toBe('interrupted');

    // press Start → a new execution (#2), the round number continues
    const v = await boot.loopService.start(busy.id);
    expect(v).toMatchObject({ status: 'active', currentExecution: { seq: 2, endedAt: null }, activeRun: { iteration: 2 } });
    const detail = await boot.loopService.listExecutions(busy.id, { limit: 5 });
    expect(detail.items.map((e) => [e.seq, e.endReason])).toEqual([
      [2, null],
      [1, 'server_down'],
    ]);
    expect(detail.items[1]?.stats).toMatchObject({ runs: 1, failed: 0, interrupted: 1, elapsedMs: 450_000 }); // interrupted, not failed (castraferrum#190)
  });

  it('UC-15 Start right after the last heartbeat, then the server dies → endedAt = Start time (not negative)', async () => {
    const old = makeKit();
    await old.tickAt(at(0)); // heartbeat 08:00:00
    old.clock.set(at(5000));
    const loop = await old.loopService.create(old.input());
    await old.loopService.start(loop.id); // Start 08:00:05, dies before the next heartbeat
    const boot = makeKit({ db: old.db, clock: new OffsetClock(() => at(MIN).getTime()) });
    await boot.recovery.recover();
    expect([...boot.db.executions.values()][0]).toMatchObject({ endReason: 'server_down', endedAt: at(5000) });
    expect((await boot.loopService.get(loop.id)).currentExecution?.stats.elapsedMs).toBe(0);
  });

  it('UC-15 no heartbeat ever → endedAt = startup time; recovery writes a fresh heartbeat right away', async () => {
    const old = makeKit();
    const loop = await old.loopService.create(old.input());
    await old.loopService.start(loop.id);
    const boot = makeKit({ db: old.db, clock: new OffsetClock(() => at(MIN).getTime()) });
    const r = await boot.recovery.recover();
    expect(r.lastHeartbeatAt).toBeNull();
    expect([...boot.db.executions.values()][0]?.endedAt).toEqual(at(MIN));
    expect(boot.db.heartbeat).toEqual(at(MIN));
  });

  it('UC-15 startup when nothing is running → changes nothing', async () => {
    const k = makeKit();
    await k.loopService.create(k.input());
    expect(await k.recovery.recover()).toMatchObject({ interruptedRuns: 0, closedExecutions: 0, stoppedLoops: 0 });
  });
});
