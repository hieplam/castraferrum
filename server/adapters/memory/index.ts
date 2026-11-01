import type { Repositories } from '../../ports/repositories';
import { MemoryDb } from './memory-db';
import { MemoryExecutionRepository } from './memory-execution-repository';
import { MemoryHeartbeatRepository } from './memory-heartbeat-repository';
import { MemoryLoopProbeRepository } from './memory-loop-probe-repository';
import { MemoryLoopRepository } from './memory-loop-repository';
import { MemoryRepoRepository } from './memory-repo-repository';
import { MemoryRunLogRepository } from './memory-run-log-repository';
import { MemoryRunRepository } from './memory-run-repository';

/** In-RAM fake with the same behaviour as postgres/ (proven by tests/contract/). Used for the test service. */
export function createMemoryRepositories(db: MemoryDb = new MemoryDb()): Repositories & { db: MemoryDb } {
  return {
    db,
    repos: new MemoryRepoRepository(db),
    loops: new MemoryLoopRepository(db),
    executions: new MemoryExecutionRepository(db),
    runs: new MemoryRunRepository(db),
    logs: new MemoryRunLogRepository(db),
    heartbeat: new MemoryHeartbeatRepository(db),
    probes: new MemoryLoopProbeRepository(db),
  };
}
