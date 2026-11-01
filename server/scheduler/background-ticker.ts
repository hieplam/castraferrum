// The third entry layer (next to HTTP and the schedule ticker): calls `tick()` of each background service regularly (spec 3).
// A background tick can wait on a slow command, so each service has its own in-flight promise: a busy service skips a beat, and the
// others keep going. Decides nothing itself. A failing tick is only logged, and the next tick retries.
import type { BackgroundService } from '../services/contracts';

export type BackgroundTickerOptions<S extends BackgroundService> = {
  /** Defaults to 1 000 ms. */
  everyMs?: number;
  /** Error of a service's tick (reported once each time that service flips from working -> failing). */
  onError?: (err: unknown) => void;
  /** Report of each tick. */
  onTick?: (report: Awaited<ReturnType<S['tick']>>) => void;
};

export type BackgroundTicker = {
  /** Awaits the running tick of each service, then one more tick of each. */
  once(): Promise<void>;
  /** Stops scheduling new ticks, then waits for the running ticks to finish. */
  stop(): Promise<void>;
};

export function startBackgroundTicker<S extends BackgroundService>(services: S[], opts: BackgroundTickerOptions<S> = {}): BackgroundTicker {
  const lanes = services.map((service) => ({ service, current: null as Promise<void> | null, failing: false }));
  type Lane = (typeof lanes)[number];
  let stopped = false;

  const run = async (lane: Lane): Promise<void> => {
    try {
      const report = await lane.service.tick();
      lane.failing = false;
      opts.onTick?.(report as Awaited<ReturnType<S['tick']>>);
    } catch (err) {
      if (!lane.failing) opts.onError?.(err);
      lane.failing = true;
    }
  };

  const fire = (lane: Lane): Promise<void> => {
    lane.current = run(lane).finally(() => {
      lane.current = null;
    });
    return lane.current;
  };

  const beat = () => {
    if (stopped) return;
    for (const lane of lanes) if (!lane.current) void fire(lane);
  };

  const timer = setInterval(beat, opts.everyMs ?? 1000);
  beat(); // first tick right when started

  return {
    async once() {
      await Promise.all(
        lanes.map(async (lane) => {
          while (lane.current) await lane.current;
          if (!stopped) await fire(lane);
        }),
      );
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await Promise.all(lanes.map((lane) => lane.current));
    },
  };
}
