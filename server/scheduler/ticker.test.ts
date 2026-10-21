import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SchedulingService, TickReport } from '../services/contracts';
import { startTicker } from './ticker';

const report = (): TickReport => ({ at: new Date(), ran: true, heartbeat: false, timedOut: 0, started: [], skipped: [], errors: [] });

afterEach(() => {
  vi.useRealTimers();
});

describe('startTicker', () => {
  it('first tick right at start, then every everyMs; stop() → no more ticks', async () => {
    vi.useFakeTimers();
    const tick = vi.fn(async () => report());
    const t = startTicker({ tick }, { everyMs: 1000 });
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(tick).toHaveBeenCalledTimes(4);
    await t.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(4);
  });

  it('previous tick not done → no overlapping call; stop() waits for the running tick to finish', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const tick = vi.fn(() => new Promise<TickReport>((r) => (release = () => r(report()))));
    const t = startTicker({ tick } satisfies SchedulingService, { everyMs: 100 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stopping = t.stop().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);
  });

  it('a failing tick (DB down) → reported once until it works again, the ticker does not die', async () => {
    vi.useFakeTimers();
    let fail = true;
    const tick = vi.fn(async () => {
      if (fail) throw new Error('db down');
      return report();
    });
    const onError = vi.fn();
    const onTick = vi.fn();
    const t = startTicker({ tick }, { everyMs: 100, onError, onTick });
    await vi.advanceTimersByTimeAsync(500);
    expect(onError).toHaveBeenCalledTimes(1);
    fail = false;
    await vi.advanceTimersByTimeAsync(200);
    expect(onTick).toHaveBeenCalled();
    fail = true;
    await vi.advanceTimersByTimeAsync(200);
    expect(onError).toHaveBeenCalledTimes(2);
    await t.stop();
  });
});
