import { defineConfig, devices } from '@playwright/test';
import { databaseUrl, loadDotEnv, readPort } from './server/config.ts';
import { useTestTemp } from './tests/support/test-temp.ts';

loadDotEnv();
const tempEnv = useTestTemp();
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
    // e2e tests carry @UC-xx tags (counted by uc-coverage) plus @smoke / @shell. phone.spec.ts (UC-34) also runs in webkit-phone.
    // acceptance.iphone.spec.ts is the iPhone part of the U27 acceptance journey: it runs only in iphone-lan.
    { name: 'chromium', testDir: 'tests/e2e', testIgnore: ['**/acceptance.iphone.spec.ts'], use: { ...devices['Desktop Chrome'] } },
    // The phone in WebKit (task U24, UC-34): an emulated iPhone 15. Installed by scripts/install-webkit.mjs.
    { name: 'webkit-phone', testDir: 'tests/e2e', testMatch: ['**/phone.spec.ts'], use: { ...devices['iPhone 15'] } },
    // The acceptance journey (task U27, G9) in WebKit as an iPhone 13, through the machine's LAN address (a relay on 0.0.0.0).
    { name: 'iphone-lan', testDir: 'tests/e2e', testMatch: ['**/acceptance.iphone.spec.ts'], use: { ...devices['iPhone 13'] } },
    // screenshots of the real app next to the approved preview + pixel diff (tests/visual/ds/); written to reports/compare/ds/ or
    // design/compare/ds/ (npm run design:compare)
    { name: 'visual', testDir: 'tests/visual', testMatch: '*.visual.ts', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // The real build (dist/web) + Fastify + Postgres DB loops_test, in test mode.
    command: 'node --import tsx server/main.ts',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...tempEnv,
      LOOPS_PORT: String(port),
      LOOPS_TEST_MODE: '1',
      // 4-item transcript pages: even the small transcript of a haiku turn must scroll up and load several pages (UC-27)
      LOOPS_TRANSCRIPT_PAGE: '4',
      DATABASE_URL: databaseUrl(process.env, 'test'),
    },
  },
});
