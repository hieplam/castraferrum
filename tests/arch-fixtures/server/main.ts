// Valid: the composition root wires everything together.
import { SystemClock } from './adapters/system-clock';
import { timeRoutes } from './http/time-routes';
import { DefaultTimeService } from './services/default-time-service';
export const wiring = { timeRoutes, service: new DefaultTimeService(new SystemClock()) };
