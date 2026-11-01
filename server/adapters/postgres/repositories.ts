import type pg from 'pg';
import type { Repositories } from '../../ports/repositories';
import { PgClaimRepository } from './pg-claim-repository';
import { PgExecutionRepository } from './pg-execution-repository';
import { PgGateRepository } from './pg-gate-repository';
import { PgGoalRepository } from './pg-goal-repository';
import { PgHeartbeatRepository } from './pg-heartbeat-repository';
import { PgHoldRepository } from './pg-hold-repository';
import { PgLoopProbeRepository } from './pg-loop-probe-repository';
import { PgLoopRepository } from './pg-loop-repository';
import { PgNoticeRepository } from './pg-notice-repository';
import { PgRepoRepository } from './pg-repo-repository';
import { PgRunLogRepository } from './pg-run-log-repository';
import { PgRunRepository } from './pg-run-repository';

export function createPgRepositories(pool: pg.Pool): Repositories {
  return {
    repos: new PgRepoRepository(pool),
    loops: new PgLoopRepository(pool),
    executions: new PgExecutionRepository(pool),
    runs: new PgRunRepository(pool),
    logs: new PgRunLogRepository(pool),
    heartbeat: new PgHeartbeatRepository(pool),
    notices: new PgNoticeRepository(pool),
    probes: new PgLoopProbeRepository(pool),
    goals: new PgGoalRepository(pool),
    claims: new PgClaimRepository(pool),
    gate: new PgGateRepository(pool),
    holds: new PgHoldRepository(pool),
  };
}
