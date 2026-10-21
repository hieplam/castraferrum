// violates: services-talk-via-interface
// A service does not import another service's Default... class; it receives it through the interface in contracts.ts (wired in main.ts).
import { DefaultTimeService } from './default-time-service';
export const late = (s: DefaultTimeService) => s.now();
