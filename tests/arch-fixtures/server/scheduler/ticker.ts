// Valid: the entry layer calls services through an interface.
import type { TimeService } from '../services/contracts';
export function tick(time: TimeService) { return time.now(); }
