import { defineConfig, devices } from '@playwright/test';
import { databaseUrl, loadDotEnv, readPort } from './server/config.ts';

loadDotEnv();
// A separate port for e2e so it never collides with the real instance on 7070.
const port = readPort(process.env, 'LOOPS_E2E_PORT', 7071);

export default defineConfig({
  workers: 1,
  forbidOnly: true,
  retries: 0,
  // reports/e2e.json is the input of scripts/uc-coverage.mjs (the ratchet).
  reporter: [['list'], ['json', { outputFile: 'reports/e2e.json' }]],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [
    // e2e tests carry @UC-xx tags (counted by uc-coverage) plus @smoke / @shell
    // phone.spec.ts (UC-34) runs on the new UI only: chromium-new and webkit-phone.
    { name: 'chromium', testDir: 'tests/e2e', testIgnore: ['**/phone.spec.ts'], use: { ...devices['Desktop Chrome'] } },
    // The new UI (UI uplift, task U13): the same server with `castraferrum.ui=new` stored for its origin; a screen task adds its
    // specs to testMatch once its screen is built.
    {
      name: 'chromium-new',
      testDir: 'tests/e2e',
      testMatch: ['**/smoke.spec.ts', '**/ui-switch.spec.ts', '**/list.spec.ts', '**/form.spec.ts', '**/detail.spec.ts', '**/concurrency.spec.ts', '**/system.spec.ts', '**/repo.spec.ts', '**/shell.spec.ts', '**/phone.spec.ts', '**/transcript.spec.ts', '**/claude.spec.ts', '**/repo-browse.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${port}`, localStorage: [{ name: 'castraferrum.ui', value: 'new' }] }] },
      },
    },
    // The phone in WebKit (task U24, UC-34): an emulated iPhone 15 on the new UI. Installed by scripts/install-webkit.mjs.
    {
      name: 'webkit-phone',
      testDir: 'tests/e2e',
      testMatch: ['**/phone.spec.ts'],
      use: {
        ...devices['iPhone 15'],
        storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${port}`, localStorage: [{ name: 'castraferrum.ui', value: 'new' }] }] },
      },
    },
    // screenshots of the real app next to the approved preview + pixel diff (tests/visual/shell.visual.ts); written to reports/compare/ or
    // design/compare/ (npm run design:compare)
    { name: 'visual', testDir: 'tests/visual', testMatch: '*.visual.ts', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // The real build (dist/web) + Fastify + Postgres DB loops_test, in test mode.
    command: 'node --import tsx server/main.ts',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      LOOPS_PORT: String(port),
      LOOPS_TEST_MODE: '1',
      // 4-item transcript pages: even the small transcript of a haiku turn must scroll up and load several pages (UC-27)
      LOOPS_TRANSCRIPT_PAGE: '4',
      DATABASE_URL: databaseUrl(process.env, 'test'),
    },
  },
});
