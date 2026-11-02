import type { ClaimRepository } from './claims';
import type { ExecutionRepository } from './execution-repository';
import type { GateRepository } from './gate-repository';
import type { GoalCardRepository } from './goal-card-repository';
import type { GoalRepository } from './goal-repository';
import type { HeartbeatRepository } from './heartbeat-repository';
import type { HoldRepository } from './hold-repository';
import type { LoopProbeRepository } from './loop-probe-repository';
import type { LoopRepository } from './loop-repository';
import type { NoticeRepository } from './notice-repository';
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
  notices: NoticeRepository;
  probes: LoopProbeRepository;
  goals: GoalRepository;
  claims: ClaimRepository;
  gate: GateRepository;
  holds: HoldRepository;
  goalCards: GoalCardRepository;
};
