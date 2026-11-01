import type pg from 'pg';
import type { Repositories } from '../../ports/repositories';
import { PgExecutionRepository } from './pg-execution-repository';
import { PgHeartbeatRepository } from './pg-heartbeat-repository';
import { PgLoopProbeRepository } from './pg-loop-probe-repository';
import { PgLoopRepository } from './pg-loop-repository';
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
    probes: new PgLoopProbeRepository(pool),
  };
}
