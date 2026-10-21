import type { Clock } from '../../ports/clock';

/** The machine's real time — the normal (non-test) build. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
