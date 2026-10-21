// violates: entry-layer-only-service-contracts
// Even a single `import type` is a violation: the entry layer only knows the interface in services/contracts.ts.
import type { DefaultTimeService } from '../services/default-time-service';
export type Concrete = DefaultTimeService;
