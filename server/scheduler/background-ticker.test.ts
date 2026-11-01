import { afterEach, describe, expect, it, vi } from 'vitest';
import { startBackgroundTicker } from './background-ticker';

const report = () => ({ errors: [] });
type Report = ReturnType<typeof report>;

afterEach(() => {
  vi.useRealTimers();
});

function held() {
  let release!: () => void;
  const tick = vi.fn(() => new Promise<Report>((r) => (release = () => r(report()))));
  return { tick, release: () => release() };
}

describe('startBackgroundTicker', () => {
  it('each service ticks at start and then every everyMs; stop() -> no more ticks', async () => {
    vi.useFakeTimers();
    const a = vi.fn(async () => report());
    const b = vi.fn(async () => report());
    const t = startBackgroundTicker([{ tick: a }, { tick: b }], { everyMs: 1000 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(a).toHaveBeenCalledTimes(4);
    expect(b).toHaveBeenCalledTimes(4);
    await t.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(a).toHaveBeenCalledTimes(4);
  });

  it('a hung service gets no second call, and the other service keeps ticking', async () => {
    vi.useFakeTimers();
    const hung = held();
    const other = vi.fn(async () => report());
    const t = startBackgroundTicker([hung, { tick: other }], { everyMs: 100 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(hung.tick).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(11);

    hung.release();
    await vi.advanceTimersByTimeAsync(100);
    expect(hung.tick).toHaveBeenCalledTimes(2);
    hung.release();
    await t.stop();
  });

  it('a failing service is reported once until it works again, and it stops no other service', async () => {
    vi.useFakeTimers();
    let fail = true;
    const failing = vi.fn(async () => {
      if (fail) throw new Error('db down');
      return report();
    });
    const other = vi.fn(async () => report());
    const onError = vi.fn();
    const onTick = vi.fn();
    const t = startBackgroundTicker([{ tick: failing }, { tick: other }], { everyMs: 100, onError, onTick });
    await vi.advanceTimersByTimeAsync(500);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(failing).toHaveBeenCalledTimes(6);
    expect(other).toHaveBeenCalledTimes(6);
    fail = false;
    await vi.advanceTimersByTimeAsync(200);
    fail = true;
    await vi.advanceTimersByTimeAsync(200);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onTick).toHaveBeenCalled();
    await t.stop();
  });

  it('a service that throws before its first await does not stay in flight', async () => {
    vi.useFakeTimers();
    const tick = vi.fn((): Promise<Report> => {
      throw new Error('sync');
    });
    const t = startBackgroundTicker([{ tick }], { everyMs: 100, onError: () => {} });
    await vi.advanceTimersByTimeAsync(300);
    expect(tick).toHaveBeenCalledTimes(4);
    await t.stop();
  });

  it('once() waits for the running tick and then awaits one more; stop() waits for a running tick', async () => {
    vi.useFakeTimers();
    const a = held();
    const t = startBackgroundTicker([a], { everyMs: 100_000 });
    let onceDone = false;
    const once = t.once().then(() => (onceDone = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(a.tick).toHaveBeenCalledTimes(1);
    a.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.tick).toHaveBeenCalledTimes(2);
    expect(onceDone).toBe(false);
    a.release();
    await once;

    await vi.advanceTimersByTimeAsync(100_000);
    let stopped = false;
    const stopping = t.stop().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);
    a.release();
    await stopping;
    expect(stopped).toBe(true);
  });
});
