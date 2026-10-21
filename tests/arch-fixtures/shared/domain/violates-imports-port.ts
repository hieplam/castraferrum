// violates: domain-only-pure-libraries
// The domain must stay pure: it does not know the server.
import type { Clock } from '../../server/ports/clock';
export type WithClock = { clock: Clock };
