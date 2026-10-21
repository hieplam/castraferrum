import { expect, test } from '@playwright/test';

// Carries no @UC-xx: it only proves the chain browser -> build -> Fastify -> Postgres stands up.
test('the home page opens from the build, server + DB alive', { tag: '@smoke' }, async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ ok: true, db: 'up' });

  await page.goto('/');
  await expect(page).toHaveTitle('Castraferrum');
  await expect(page.getByTestId('topbar')).toContainText('Castraferrum');
});
