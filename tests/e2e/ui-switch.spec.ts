// The new-UI switch (UI uplift, task U13; spec D17): `?ui=new` opens the new UI and stores the choice, `?ui=classic` brings the
// classic UI back, and every page marks its UI in `html[data-ui]`. Runs in the classic project and in `chromium-new`.
// Carries no @UC-xx: it is test plumbing, not a use case.
import { expect, test } from '@playwright/test';
import { ServerProcess } from '../support/server-process';
import { gotoApp, isNewUi, projectUi } from '../support/ui';

test('html marks the UI of this project', async ({ page }) => {
  await gotoApp(page, '/');
  await expect(page.locator('html')).toHaveAttribute('data-ui', projectUi());
  expect(await isNewUi(page)).toBe(projectUi() === 'new');
  await expect(page.getByTestId('topbar')).toContainText('Castraferrum');
});

test('?ui= switches the UI and back', async ({ page }) => {
  const html = page.locator('html');
  const stored = () => page.evaluate(() => window.localStorage.getItem('castraferrum.ui'));
  await page.goto('/?ui=new');
  await expect(html).toHaveAttribute('data-ui', 'new');
  expect(await stored()).toBe('new');
  await page.goto('/');
  await expect(html).toHaveAttribute('data-ui', 'new');
  await page.goto('/?ui=classic');
  await expect(html).toHaveAttribute('data-ui', 'classic');
  expect(await stored()).toBeNull();
  await page.goto('/');
  await expect(html).toHaveAttribute('data-ui', 'classic');
});

test('a page of another server shows the UI of this project', async ({ page }) => {
  test.setTimeout(60_000);
  const sp = await ServerProcess.launch();
  try {
    await gotoApp(page, `${sp.baseUrl}/`);
    await expect(page.locator('html')).toHaveAttribute('data-ui', projectUi());
    await expect(page.getByTestId('topbar')).toContainText('Castraferrum');
  } finally {
    await sp.stop();
  }
});
