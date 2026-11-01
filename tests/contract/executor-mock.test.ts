// Executor contract suite on MockExecutor. The Mock "second" is shortened to 50 ms so the suite runs fast; the cancel deadline is still measured in
// real time against the cancelWithinMs the Mock declares (1 000 ms). Claude executor: executor-claude.test.ts.
import { describe } from 'vitest';
import { MockExecutor } from '../../server/adapters/executors/mock/mock-executor';
import { executorContract } from './executor.contract';

describe('executor contract', () => {
  describe('mock', () => {
    executorContract(() => ({
      make: () => new MockExecutor({ tickMs: 50 }),
      succeeding: { prompt: 'Do the work', config: { durationSec: 3, failRate: 0 } },
      failing: { prompt: 'Do the work', config: { durationSec: 3, failRate: 100 } },
      long: { prompt: 'Do the work', config: { durationSec: 600, failRate: 0 } },
      invalidConfig: { durationSec: 0 },
      runWithinMs: 2000,
    }), { usageLimit: { prompt: 'Do the work [usage-limit]', config: { durationSec: 3, failRate: 0 } } });
  });
});
