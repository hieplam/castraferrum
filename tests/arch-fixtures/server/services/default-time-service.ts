// Valid: a service uses ports + domain.
import type { Clock } from '../ports/clock';
import type { TimeService } from './contracts';
export class DefaultTimeService implements TimeService {
  readonly #clock: Clock;
  constructor(clock: Clock) { this.#clock = clock; }
  now() { return this.#clock.now(); }
}
