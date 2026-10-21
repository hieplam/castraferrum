import type { Clock } from '../../ports/clock';

/**
 * Base time + a clock that can be moved by an offset (test mode, `POST /api/__test/clock`; test service). The base time defaults to real time —
 * so run durations stay correct in e2e; the test service passes a fixed base time so the clock only moves when the test advances it.
 */
export class OffsetClock implements Clock {
  readonly #base: () => number;
  #offsetMs = 0;

  constructor(base: () => number = Date.now) {
    this.#base = base;
  }

  now(): Date {
    return new Date(this.#base() + this.#offsetMs);
  }

  /** Move forward (ms > 0) or back (ms < 0). */
  advance(ms: number): Date {
    if (!Number.isFinite(ms)) throw new RangeError(`advance(${ms}): needs a finite number of ms`);
    this.#offsetMs += ms;
    return this.now();
  }

  /** Pin the clock to the instant `at` (the offset is recomputed; the base time keeps running from there). */
  set(at: Date): Date {
    if (Number.isNaN(at.getTime())) throw new RangeError('set(): invalid instant');
    this.#offsetMs = at.getTime() - this.#base();
    return this.now();
  }

  /** Back to the base time (offset 0) — `POST /api/__test/reset`. */
  reset(): Date {
    this.#offsetMs = 0;
    return this.now();
  }

  get offsetMs(): number {
    return this.#offsetMs;
  }
}
