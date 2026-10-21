// The design-system page (UI uplift, task U3) measured in a real browser: design/ds/index.html opened as a file URL at
// desktop (1440 by 900) and phone (390 by 844) width, light and dark (data-theme on html). Each check reads the
// computed style of the first visible instance inside the page's column of that theme, and the colour checks compare
// with the theme's own custom properties. No screenshots.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const PAGE = pathToFileURL(join(import.meta.dirname, '../../../design/ds/index.html')).href;
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } } as const;

/** Opens the page in a theme and returns a reader scoped to that theme's column. */
async function open(page: Page, theme: 'light' | 'dark') {
  await page.goto(PAGE);
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  const scope = `.ds-col[data-theme="${theme}"]`;
  await expect(page.locator(scope)).toBeVisible();
  const first = (sel: string) => page.locator(`${scope} ${sel}`).filter({ visible: true }).first();
  /** Computed style properties of the first visible instance of `sel`. */
  const style = async (sel: string, props: string[]) => {
    const el = first(sel);
    await expect(el, `${theme}: no visible ${sel}`).toBeVisible();
    return el.evaluate((node, ps) => {
      const cs = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      return Object.fromEntries([...ps.map((p) => [p, cs.getPropertyValue(p)]), ['box-width', r.width], ['box-height', r.height]]);
    }, props);
  };
  /** A custom property of the theme column, resolved to a computed colour. */
  const token = (name: string) =>
    page.locator(scope).evaluate((col, n) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${n})`;
      col.appendChild(probe);
      const v = getComputedStyle(probe).color;
      probe.remove();
      return v;
    }, name);
  const bodyFont = () => page.evaluate(() => getComputedStyle(document.body).fontSize);
  return { style, token, bodyFont };
}

async function colours(ui: Awaited<ReturnType<typeof open>>) {
  expect((await ui.style('.cell.is-sel', ['background-color']))['background-color']).toBe(await ui.token('--selected'));
  const pill = await ui.style('.pill.s-run', ['color', 'background-color']);
  expect(pill.color).toBe(await ui.token('--run'));
  expect(pill['background-color']).toBe(await ui.token('--run-soft'));
  expect((await ui.style('.tooltip', ['background-color']))['background-color']).toBe(await ui.token('--tip-bg'));
  expect((await ui.style('.log', ['background-color']))['background-color']).toBe(await ui.token('--log-bg'));
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`desktop ${theme}`, () => {
    test.use({ viewport: VIEWPORTS.desktop });
    test(`desktop ${theme}: sizes and colours`, async ({ page }) => {
      const ui = await open(page, theme);
      expect((await ui.style('.btn:not(.sm):not(.lg)', ['height'])).height).toBe('36px');
      expect((await ui.style('.btn.sm', ['height'])).height).toBe('30px');
      expect((await ui.style('.cell', ['min-height']))['min-height']).toBe('52px');
      expect((await ui.style('.topbar', ['height'])).height).toBe('56px');
      const pill = await ui.style('.pill', ['height', 'border-top-left-radius']);
      expect(pill.height).toBe('22px');
      expect(pill['border-top-left-radius']).toBe('999px');
      for (const f of ['.input', '.textarea', '.select']) expect((await ui.style(f, ['font-size']))['font-size'], f).toBe('16px');
      expect(await ui.bodyFont()).toBe('15px');
      await colours(ui);
    });
  });

  test.describe(`phone ${theme}`, () => {
    test.use({ viewport: VIEWPORTS.phone, isMobile: true, hasTouch: true });
    test(`phone ${theme}: sizes and colours`, async ({ page }) => {
      const ui = await open(page, theme);
      expect((await ui.style('.btn:not(.sm):not(.lg)', ['height'])).height).toBe('44px');
      expect((await ui.style('.cell', ['min-height']))['min-height']).toBe('56px');
      expect((await ui.style('.navbar', ['height'])).height).toBe('52px');
      expect((await ui.style('.tabbar', []))['box-height']).toBeGreaterThanOrEqual(56);
      const act = await ui.style('.act', ['width', 'height']);
      expect([act.width, act.height]).toEqual(['44px', '44px']);
      expect(await ui.bodyFont()).toBe('16px');
      expect((await ui.style('.input', ['font-size']))['font-size']).toBe('16px');
      await colours(ui);
    });
  });
}
