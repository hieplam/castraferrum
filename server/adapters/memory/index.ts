import type { Repositories } from '../../ports/repositories';
import { MemoryDb } from './memory-db';
import { MemoryClaimRepository } from './memory-claim-repository';
import { MemoryExecutionRepository } from './memory-execution-repository';
import { MemoryGateRepository } from './memory-gate-repository';
import { MemoryGoalCardRepository } from './memory-goal-card-repository';
import { MemoryGoalRepository } from './memory-goal-repository';
import { MemoryHeartbeatRepository } from './memory-heartbeat-repository';
import { MemoryHoldRepository } from './memory-hold-repository';
import { MemoryLoopProbeRepository } from './memory-loop-probe-repository';
import { MemoryLoopRepository } from './memory-loop-repository';
import { MemoryNoticeRepository } from './memory-notice-repository';
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
    notices: new MemoryNoticeRepository(db),
    probes: new MemoryLoopProbeRepository(db),
    goals: new MemoryGoalRepository(db),
    claims: new MemoryClaimRepository(db),
    gate: new MemoryGateRepository(db),
    goalCards: new MemoryGoalCardRepository(db),
    holds: new MemoryHoldRepository(db),
  };
}
