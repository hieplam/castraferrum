// E2E goal G15, the scoreboard on the real build: with a process review report in a repo, Settings shows the entry and it opens the page
// that lists each cause; with no report the entry is not in Settings. All real: browser, build, Fastify, git, Postgres (test mode).
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { api, closeDb, db } from '../support/form-kit';
import { seedScoreboard } from '../support/goal-loop-score-world';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
test.afterAll(closeDb);

test('G15: with a report, Settings shows the scoreboard entry and it opens the page with one row for each cause', async ({ page, request }) => {
  await seedScoreboard({ api: (method, path, body) => api(request, method, path, body) }, db());
  await page.goto('/settings');
  const link = page.getByTestId('settings-score-link');
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/scoreboard$/);
  await expect(page.getByTestId('score-cause')).toHaveCount(3);
  await expect(page.getByTestId('score-week')).toHaveCount(5);
  await expect(page.getByTestId('score-figures')).toContainText('11');
  await page.getByTestId('score-back').click();
  await expect(page).toHaveURL(/\/settings$/);
});

test('G15: with no report file, the scoreboard entry is not in Settings', async ({ page, request }) => {
  expect((await api(request, 'POST', '/api/__test/reset')).status).toBe(204);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lc-score-e2e-')));
  expect((await api(request, 'POST', '/api/repos', { path: dir, name: 'no report' })).status).toBe(201);
  await page.goto('/settings');
  await expect(page.getByTestId('settings-version')).toBeVisible();
  await expect(page.getByTestId('settings-score-link')).toHaveCount(0);
});
