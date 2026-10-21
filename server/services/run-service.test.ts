// Run service tests: a scripted executor (the test drives each event) and the real Mock under a fake timer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OffsetClock } from '../adapters/clock/offset-clock';
import { MockExecutor } from '../adapters/executors/mock/mock-executor';
import { flush, makeKit, MIN, T0, type Kit } from '../../tests/support/service-kit';

const at = (ms: number) => new Date(T0.getTime() + ms);

let k: Kit;
beforeEach(() => {
  k = makeKit();
});

async function startedLoop(over: Parameters<Kit['input']>[0] = {}) {
  const loop = await k.loopService.create(k.input(over));
  const v = await k.loopService.start(loop.id);
  await flush();
  return { loop, run: v.activeRun! };
}

describe('RunService', () => {
  it('UC-07 the session id is written as soon as the executor reports it (run still going); logs are stored in order and can be read back after it finishes', async () => {
    k.scripted.autoSession = false;
    const { run } = await startedLoop();
    const exec = k.scripted.call(1);
    expect((await k.runService.get(run.id)).sessionId).toBeNull();
    exec.session('sess-abc');
    await flush();
    expect(await k.runService.get(run.id)).toMatchObject({ status: 'running', sessionId: 'sess-abc' });
    k.clock.advance(1000);
    exec.log('one');
    await flush();
    k.clock.advance(1000);
    exec.log('two', 'warn').succeed('all done');
    await flush();

    expect(await k.runService.get(run.id)).toMatchObject({
      status: 'succeeded',
      sessionId: 'sess-abc',
      summary: 'all done',
      finishedAt: at(2000),
      durationMs: 2000,
    });
    expect((await k.runService.logs(run.id, 0)).map((l) => [l.seq, l.level, l.message, l.at])).toEqual([
      [1, 'info', 'one', at(1000)],
      [2, 'warn', 'two', at(2000)],
    ]);
    expect((await k.runService.logs(run.id, 1)).map((l) => l.seq)).toEqual([2]);
    expect(k.eventsOf('run.log').map((e) => e.line.seq)).toEqual([1, 2]);
    expect(k.eventsOf('run.finished')).toMatchObject([{ runId: run.id, status: 'succeeded' }]);
    await expect(k.runService.get('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
    await expect(k.runService.logs('00000000-0000-4000-8000-000000000000', 0)).rejects.toMatchObject({ code: 'RUN_NOT_FOUND' });
  });

  it('UC-07 the loop run history: newest first, paged', async () => {
    const { loop } = await startedLoop();
    k.scripted.call(1).succeed();
    await flush();
    await k.tickAt(at(5 * MIN));
    k.scripted.call(2).succeed();
    await flush();
    await k.tickAt(at(10 * MIN));
    const p1 = await k.runService.listByLoop(loop.id, { limit: 2 });
    expect(p1.items.map((r) => r.iteration)).toEqual([3, 2]);
    const p2 = await k.runService.listByLoop(loop.id, { limit: 2, cursor: p1.nextCursor });
    expect(p2).toMatchObject({ items: [{ iteration: 1 }], nextCursor: null });
    await expect(k.runService.listByLoop('00000000-0000-4000-8000-000000000000', { limit: 2 })).rejects.toMatchObject({
      code: 'LOOP_NOT_FOUND',
    });
  });

  describe('UC-14 failed runs', () => {
    it('UC-14 the executor reports an error → failed + error message; the execution stays open, the loop keeps going, the next tick runs normally', async () => {
      const { loop, run } = await startedLoop();
      k.scripted.call(1).fail('API returned 500');
      await flush();
      expect(await k.runService.get(run.id)).toMatchObject({ status: 'failed', error: 'API returned 500' });
      const v = await k.loopService.get(loop.id);
      expect(v).toMatchObject({ status: 'active', currentExecution: { endedAt: null, stats: { failed: 1 } } });

      await k.tickAt(at(5 * MIN));
      k.scripted.call(2).succeed();
      await flush();
      expect([...k.db.runs.values()].map((r) => [r.iteration, r.status])).toEqual([
        [1, 'failed'],
        [2, 'succeeded'],
      ]);
    });

    it('UC-14 the executor throws midway → failed with the error message, with an error log line', async () => {
      const { run } = await startedLoop();
      k.scripted.call(1).log('working on it').throw('ECONNRESET');
      await flush();
      expect(await k.runService.get(run.id)).toMatchObject({ status: 'failed', error: 'ECONNRESET' });
      expect((await k.runService.logs(run.id, 0)).map((l) => `${l.level}:${l.message}`)).toEqual(['info:working on it', 'error:ECONNRESET']);
      expect(k.active.size()).toBe(0);
    });

    it('UC-14 the executor ends without reporting a result → failed (does not hang in running)', async () => {
      const { run } = await startedLoop();
      k.scripted.call(1).end();
      await flush();
      expect(await k.runService.get(run.id)).toMatchObject({ status: 'failed', error: 'The executor ended without reporting a result' });
    });

    it('UC-14 a loop pointing at an executor that is no longer registered → failed run, the loop keeps going', async () => {
      const loop = await k.loopService.create(k.input());
      k.db.writeLoop({ ...k.db.loops.get(loop.id)!, executorKind: 'claude-agent-sdk' });
      const v = await k.loopService.start(loop.id);
      expect(v.status).toBe('active');
      expect([...k.db.runs.values()]).toMatchObject([{ status: 'failed', error: 'No such executor "claude-agent-sdk"' }]);
    });
  });

  it('cancel on a finished run → returned unchanged; cancel on a missing run → RUN_NOT_FOUND', async () => {
    const { run } = await startedLoop();
    k.scripted.call(1).succeed();
    await flush();
    expect(await k.runService.cancel(run.id, 'cancelled')).toMatchObject({ status: 'succeeded' });
    await expect(k.runService.cancel('00000000-0000-4000-8000-000000000000', 'cancelled')).rejects.toMatchObject({
      code: 'RUN_NOT_FOUND',
    });
  });

  it('cancel on a run not running in this process (not in the registry) → the DB is still written as cancelled', async () => {
    const { run } = await startedLoop();
    k.active.release(run.id);
    expect(await k.runService.cancel(run.id, 'cancelled')).toMatchObject({ status: 'cancelled' });
  });

  it('a Stop sneaking in between the tick picking up the due loop and the run starting → the run is cancelled at once, the executor never runs', async () => {
    const { loop } = await startedLoop();
    k.scripted.call(1).succeed();
    await flush();
    const exec = [...k.db.executions.values()][0]!;
    await k.loopService.stop(loop.id);
    const late = await k.runService.startScheduled(loop.id, exec.id, at(5 * MIN));
    expect(late).toMatchObject({ status: 'cancelled', iteration: 2 });
    expect(k.scripted.calls).toHaveLength(1);
    expect(k.runningCount()).toBe(0);
  });
});

describe('RunService + MockExecutor (fake timer)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function mockKit(random: () => number = () => 0.99) {
    // Base time = the faked Date.now → the service clock moves together with the Mock timer.
    return makeKit({ clock: new OffsetClock(), mock: new MockExecutor({ random }) });
  }

  it('UC-06 Mock prints "Start round #N — prompt", one working… (k/N) line per second, then Done (simulated) → succeeded', async () => {
    const m = mockKit();
    const loop = await m.loopService.create(m.input({ prompt: 'Clean the game pilot backlog', executor: { kind: 'mock', config: { durationSec: 3 } } }));
    const run = (await m.loopService.start(loop.id)).activeRun!;
    await vi.advanceTimersByTimeAsync(0);
    expect((await m.runService.logs(run.id, 0)).map((l) => l.message)).toEqual(['Start round #1 — prompt: «Clean the game pilot backlog»']);
    expect((await m.runService.get(run.id)).sessionId).toMatch(/^mock-[0-9a-f-]{36}$/);

    await vi.advanceTimersByTimeAsync(1000);
    // A new line appears right after each second (≤ 1 second) and is published on the bus for the live log.
    expect(m.eventsOf('run.log').map((e) => e.line.message).at(-1)).toBe('working… (1/3)');
    await vi.advanceTimersByTimeAsync(2000);
    const logs = await m.runService.logs(run.id, 0);
    expect(logs.map((l) => [l.message, l.at.getTime() - T0.getTime()])).toEqual([
      ['Start round #1 — prompt: «Clean the game pilot backlog»', 0],
      ['working… (1/3)', 1000],
      ['working… (2/3)', 2000],
      ['working… (3/3)', 3000],
      ['Done (simulated)', 3000],
    ]);
    expect(await m.runService.get(run.id)).toMatchObject({ status: 'succeeded', summary: 'Done (simulated)', durationMs: 3000 });
  });

  it('UC-14 Mock failRate 100 % → Simulated error → failed; the loop keeps going', async () => {
    const m = mockKit(() => 0.5);
    const loop = await m.loopService.create(m.input({ executor: { kind: 'mock', config: { durationSec: 4, failRate: 100 } } }));
    const run = (await m.loopService.start(loop.id)).activeRun!;
    await vi.advanceTimersByTimeAsync(4000);
    expect(await m.runService.get(run.id)).toMatchObject({ status: 'failed', error: 'Simulated error' });
    // random 0.5 → the error comes at second 1 + floor(0.5 × 4) = 3
    expect((await m.runService.logs(run.id, 0)).map((l) => l.message).slice(1)).toEqual([
      'working… (1/4)',
      'working… (2/4)',
      'Simulated error',
    ]);
    expect((await m.loopService.get(loop.id)).status).toBe('active');
  });

  it('UC-05 Stop on a running Mock run → cancelled in the DB at once, Mock stops within ≤ 1 second, prints no more working…', async () => {
    const m = mockKit();
    const loop = await m.loopService.create(m.input({ executor: { kind: 'mock', config: { durationSec: 600 } } }));
    const run = (await m.loopService.start(loop.id)).activeRun!;
    await vi.advanceTimersByTimeAsync(2500);
    const stopped = await m.loopService.stop(loop.id);
    expect(stopped.lastRun).toMatchObject({ id: run.id, status: 'cancelled', durationMs: 2500 });
    expect(m.active.size()).toBe(0); // abort signal → Mock's sleep returns at once, the for await loop exits
    await vi.advanceTimersByTimeAsync(5000);
    expect((await m.runService.logs(run.id, 0)).map((l) => l.message).slice(1)).toEqual([
      'working… (1/600)',
      'working… (2/600)',
      'Cancelled (Stop)',
    ]);
  });

  it('UC-13 a Mock run longer than timeoutSec → the scheduler tick cancels it as timed_out, Mock receives the signal', async () => {
    const m = mockKit();
    const loop = await m.loopService.create(m.input({ cron: '0 * * * *', timeoutSec: 60, executor: { kind: 'mock', config: { durationSec: 600 } } }));
    const run = (await m.loopService.start(loop.id)).activeRun!;
    await vi.advanceTimersByTimeAsync(59_000);
    expect((await m.scheduling.tick()).timedOut).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await m.scheduling.tick()).timedOut).toBe(1);
    expect(await m.runService.get(run.id)).toMatchObject({ status: 'timed_out', error: 'Timed out (60 seconds) - cancelled', durationMs: MIN });
    expect(m.active.size()).toBe(0);
  });
});
