// Repository contract suite on the in-memory fake (server/adapters/memory/).
import { describe } from 'vitest';
import { createMemoryRepositories } from '../../server/adapters/memory';
import { repositoryContract, type ContractEnv } from './repositories.contract';

describe('memory', () => {
  const repos = createMemoryRepositories();
  const env: ContractEnv = {
    ...repos,
    reset: async () => repos.db.reset(),
    // Write straight into the MemoryDb gate_jobs "table", where the partial unique indexes live.
    rawInsertGateJob: async (row) => {
      repos.db.writeGateJob({
        ...row,
        taskKey: 'raw',
        title: null,
        failedStep: null,
        queuedAt: new Date('2026-10-18T01:00:00Z'),
        startedAt: null,
        finishedAt: null,
        ratifiedAt: null,
      });
    },
    // Write straight into the MemoryDb runs "table" - the place that holds the constraint, bypassing MemoryRunRepository.
    rawInsertRunning: async (row) => {
      repos.db.writeRun(
        {
          ...row,
          trigger: 'schedule',
          status: 'running',
          skipReason: null,
          scheduledFor: null,
          startedAt: new Date('2026-10-18T01:00:00Z'),
          deadlineAt: null,
          finishedAt: null,
          durationMs: null,
          promptSnapshot: 'raw',
          executorKind: 'mock',
          executorConfig: {},
          summary: null,
          error: null,
          costUsd: null,
          sessionId: null,
          taskKey: null,
          slot: null,
          endResult: null,
          endPr: null,
          resumeCount: 0,
        },
        true,
      );
    },
  };
  repositoryContract(() => env);
});
