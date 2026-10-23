// The behaviour of the new UI measured in a real browser (UI uplift; spec decisions D9, D10 and D28, and the focus rules of spec
// 4.8). No shots: the new kit's flag, then the DOM. Six tests: the theme button's tooltip, no tooltip on touch, one `h1` per
// page and the phone tab bar with its touch targets (task U14); the `?` of Recent runs as a toggletip on the desktop and as a
// sheet on the phone (task U16).
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { en } from '../../../shared/i18n/en';
import { DS_DATA_JS, loopId, PREVIEW_NOW, previewDirs, seedPreviewWorld } from '../../support/preview-world';
import { liveDbUrl, ServerProcess } from '../../support/server-process';
import { PHONE_VIEW, PREVIEW_VIEW } from './kit';

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

/** A server with the new preview's world (a loop with runs grouped by active period); `loopUrl` = the loop page of "Issue backlog worker". */
function useLoopWorld() {
  const ctx = {} as { sp: ServerProcess; db: pg.Pool; loopUrl: string };
  test.beforeAll(async () => {
    ctx.sp = await ServerProcess.launch();
    ctx.db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
    expect((await ctx.sp.api('POST', '/api/__test/reset')).status).toBe(204);
    expect((await ctx.sp.api('POST', '/api/__test/clock', { at: PREVIEW_NOW.toISOString() })).status).toBe(200);
    expect((await ctx.sp.api('POST', '/api/__test/dirs', { paths: previewDirs(DS_DATA_JS) })).status).toBe(204);
    await seedPreviewWorld(ctx.db, { history: true }, DS_DATA_JS);
    ctx.loopUrl = `${ctx.sp.baseUrl}/loops/${loopId('pilot', DS_DATA_JS)}`;
  });
  test.afterAll(async () => {
    await ctx.sp?.stop();
    await ctx.db?.end();
  });
  return ctx;
}

const focused = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.textContent ?? null);

test.describe('the help of Recent runs on the desktop', () => {
  test.use(PREVIEW_VIEW);
  const ctx = useLoopWorld();

  test('the ? is a toggletip: a click opens a popover, Escape closes it and gives the focus back to the ?', async ({ page }) => {
    await page.clock.setFixedTime(PREVIEW_NOW);
    await page.goto(ctx.loopUrl);
    const help = page.getByTestId('runs-help');
    await expect(help).toBeVisible();
    await expect(help).toHaveAttribute('aria-label', en['runs.help']);
    await expect(help).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('help-sheet')).toHaveCount(0);

    await help.click();
    const pop = page.getByTestId('help-sheet');
    await expect(pop).toBeVisible();
    await expect(pop).toHaveClass(/\bpopover\b/);
    await expect(pop).toContainText(en['help.title']);
    await expect(pop).toContainText(en['help.periodBody']);
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await expect(help).toHaveAttribute('aria-controls', (await pop.getAttribute('id'))!);
    // A popover, not a modal: nothing covers the page.
    await expect(page.locator('.scrim')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-sheet')).toHaveCount(0);
    await expect(help).toHaveAttribute('aria-expanded', 'false');
    await expect(help).toBeFocused();
  });
});

test.describe('the help of Recent runs on the phone', () => {
  test.use(PHONE_VIEW);
  const ctx = useLoopWorld();

  test('the ? opens a sheet: focus moves in, Tab stays inside, Escape closes it and gives the focus back to the ?', async ({ page }) => {
    await page.clock.setFixedTime(PREVIEW_NOW);
    await page.goto(ctx.loopUrl);
    const help = page.getByTestId('runs-help');
    await expect(help).toBeVisible();
    await help.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByTestId('help-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveClass(/\bsheet\b/);
    await expect(sheet).toHaveAttribute('role', 'dialog');
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet).toContainText(en['help.title']);
    await expect(page.locator('.scrim')).toHaveCount(1);

    // Focus is inside the sheet, and Tab (both ways) keeps it there.
    const inside = () => sheet.evaluate((el) => el.contains(document.activeElement));
    await expect.poll(inside).toBe(true);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await inside(), `Tab ${i + 1} left the sheet (focus on ${await focused(page)})`).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside(), `Shift+Tab ${i + 1} left the sheet (focus on ${await focused(page)})`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-sheet')).toHaveCount(0);
    await expect(page.locator('.scrim')).toHaveCount(0);
    await expect(help).toBeFocused();
  });
});
