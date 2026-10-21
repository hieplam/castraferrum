// violates: services-call-ports-only
// A service must not know an implementation; it goes through a port.
import { SystemClock } from '../adapters/system-clock';
export const clock = new SystemClock();
