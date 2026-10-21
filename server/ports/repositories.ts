import type { ExecutionRepository } from './execution-repository';
import type { HeartbeatRepository } from './heartbeat-repository';
import type { LoopRepository } from './loop-repository';
import type { RepoRepository } from './repo-repository';
import type { RunLogRepository } from './run-log-repository';
import type { RunRepository } from './run-repository';

/** The set of repositories the services need — `server/main.ts` wires the postgres/ version, service tests wire the memory/ version. */
export type Repositories = {
  repos: RepoRepository;
  loops: LoopRepository;
  executions: ExecutionRepository;
  runs: RunRepository;
  logs: RunLogRepository;
  heartbeat: HeartbeatRepository;
};
