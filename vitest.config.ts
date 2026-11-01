import { defineConfig } from 'vitest/config';
import { loadDotEnv } from './server/config.ts';

loadDotEnv();
const dbSetup = ['tests/support/db-global-setup.ts'];

// Three groups, run one after another (groupOrder) because contract + api share the loops_test DB.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'web/**/*.test.ts', 'tests/tools/**/*.test.ts'],
          environment: 'node',
          // Tests that start a real process (git, node) pass 5 s under CPU load with no fault (issue 271).
          testTimeout: 30_000,
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'contract',
          include: ['tests/contract/**/*.test.ts'],
          globalSetup: dbSetup,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
      {
        test: {
          name: 'api',
          include: ['tests/api/**/*.test.ts'],
          globalSetup: dbSetup,
          fileParallelism: false,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
