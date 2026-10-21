// The second entry layer (next to HTTP): calls `SchedulingService.tick()` regularly (ARCHITECTURE.md § Schedule tick). Decides
// nothing itself — an overlapping tick (slow DB) makes the service return `ran: false`; a failing tick (DB down) is only logged, and the next tick retries.
import type { SchedulingService, TickReport } from '../services/contracts';

export type TickerOptions = {
  /** Defaults to 1 000 ms. */
  everyMs?: number;
  /** Error of a tick (reported once each time it flips from working → failing, so a long DB outage does not flood the log). */
  onError?: (err: unknown) => void;
  /** Report of each tick (for observation / tests). */
  onTick?: (report: TickReport) => void;
};

export type Ticker = {
  /** Stops scheduling new ticks, then waits for the running tick (if any) to finish. */
  stop(): Promise<void>;
};

export function startTicker(scheduling: SchedulingService, opts: TickerOptions = {}): Ticker {
  const everyMs = opts.everyMs ?? 1000;
  let current: Promise<void> | null = null;
  let failing = false;
  let stopped = false;

  const fire = () => {
    if (stopped || current) return; // the previous tick is not done → skip this one (the service also guards against it)
    current = scheduling
      .tick()
      .then((report) => {
        failing = false;
        opts.onTick?.(report);
      })
      .catch((err: unknown) => {
        if (!failing) opts.onError?.(err);
        failing = true;
      })
      .finally(() => {
        current = null;
      });
  };

  const timer = setInterval(fire, everyMs);
  fire(); // first tick right when started — do not wait out the first second

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      if (current) await current;
    },
  };
}
