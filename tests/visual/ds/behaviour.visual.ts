// The behaviour of the new frame, Settings and Not found (UI uplift, task U14; spec decisions D9, D10 and D28) measured in a
// real browser. No shots: the new kit's flag, then the DOM. Four tests: the theme button's tooltip, no tooltip on touch, one
// `h1` per page, and the phone tab bar with its touch targets.
import { expect, test, type Page } from '@playwright/test';
import { en } from '../../../shared/i18n/en';
import { PHONE_VIEW, PREVIEW_VIEW, useNewUi } from './kit';

test.beforeEach(({ page }) => useNewUi(page));

const tooltip = (page: Page) => page.getByRole('tooltip');

test.describe('desktop pointer and keyboard', () => {
  test.use(PREVIEW_VIEW);

  test("the theme button's tooltip shows on hover and on keyboard focus, is described by aria-describedby and hides on Escape", async ({ page }) => {
    await page.goto('/settings');
    const button = page.getByTestId('toggle-theme');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-label', en['theme.switch']);
    await expect(tooltip(page)).toHaveCount(0);

    await button.hover();
    await expect(tooltip(page)).toBeVisible();
    await expect(tooltip(page)).toHaveText(en['theme.switch']);
    const id = await tooltip(page).getAttribute('id');
    expect(id).toBeTruthy();
    await expect(button).toHaveAttribute('aria-describedby', id!);
    await page.keyboard.press('Escape');
    await expect(tooltip(page)).toHaveCount(0);

    // Keyboard focus: move the pointer away, then Tab to the button.
    await page.mouse.move(5, 400);
    await expect(tooltip(page)).toHaveCount(0);
    for (let i = 0; i < 12 && !(await button.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await expect(tooltip(page)).toBeVisible();
    await expect(button).toHaveAttribute('aria-describedby', (await tooltip(page).getAttribute('id'))!);
    await page.keyboard.press('Escape');
    await expect(tooltip(page)).toHaveCount(0);
  });
});

test.describe('touch', () => {
  test.use({ ...PREVIEW_VIEW, hasTouch: true });

  test('tapping the theme button shows no tooltip (a tap switches the theme and nothing else)', async ({ page }) => {
    await page.goto('/settings');
    const button = page.getByTestId('toggle-theme');
    await expect(button).toBeVisible();
    const before = await page.locator('html').getAttribute('data-theme');
    // Watch the DOM from before the tap: a tooltip that shows and goes again (the pointer leaves when the finger lifts) still counts.
    await page.evaluate(() => {
      const w = window as unknown as { __tipSeen: boolean };
      w.__tipSeen = false;
      new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) if (n instanceof Element && (n.matches('[role="tooltip"]') || n.querySelector('[role="tooltip"]'))) w.__tipSeen = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
    await button.tap();
    // The tap did its job (the theme changed) ...
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', before!);
    // ... and no tooltip appeared, now or a moment later.
    await expect(tooltip(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(tooltip(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __tipSeen: boolean }).__tipSeen), 'a tooltip was drawn during the tap').toBe(false);
    await expect(button).not.toHaveAttribute('aria-describedby', /.+/);
  });
});

test.describe('one h1', () => {
  test.use(PREVIEW_VIEW);

  test('/settings and an unknown URL each have exactly one h1', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-version')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en['settings.title']);

    await page.goto('/no/such/page');
    await expect(page.getByText(en['missing.title'])).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en['missing.title']);
  });
});

test.describe('phone', () => {
  test.use(PHONE_VIEW);

  test('the tab bar marks the current tab, and every visible control of /settings is at least 44 by 44', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('settings-version')).toBeVisible();
    await expect(page.getByTestId('tabbar')).toBeVisible();
    await expect(page.getByTestId('tab-settings')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('tab-loops')).not.toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('tab-repos')).not.toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('topbar')).toBeHidden();

    // A segment of a segmented control is measured as the control it belongs to: the control is 44 tall, its segments are
    // the options inside it.
    const sizes = await page.locator('button, a[href], input, select, textarea, [role="button"]').evaluateAll((els) =>
      els
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        })
        .map((el) => {
          const own = el.getBoundingClientRect();
          const seg = el.closest('.seg');
          const height = seg ? seg.getBoundingClientRect().height : own.height;
          return { name: (el.getAttribute('data-testid') ?? el.textContent ?? el.tagName).trim(), width: own.width, height };
        }),
    );
    // three tabs, three theme segments, two language segments
    expect(sizes.length).toBeGreaterThanOrEqual(8);
    for (const s of sizes) {
      expect(s.width, `${s.name} is ${s.width} wide`).toBeGreaterThanOrEqual(44);
      expect(s.height, `${s.name} is ${s.height} tall`).toBeGreaterThanOrEqual(44);
    }
  });
});
