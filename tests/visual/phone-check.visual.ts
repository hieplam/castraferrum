// The measuring function of `npm run phone:check` (scripts/phone-check.mts) on two inline pages at phone width: one that
// fits (its wide table sits in its own scroller), one with a 600px-wide table that makes the document scroll sideways.
import { expect, test } from '@playwright/test';
import { overflowOf } from '../../scripts/phone-check.mts';

// isMobile as in the real check: Chromium then widens innerWidth to the content, which must not hide the overflow.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('a page that fits has no overflow', async ({ page }) => {
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0"><p>short text</p>' +
    '<div style="overflow-x:auto"><table style="width:600px"><tr><td>in a scroller</td></tr></table></div></body>');
  expect(await overflowOf(page)).toBeNull();
});

test('a 600px-wide table overflows by 210px', async ({ page }) => {
  await page.setContent('<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0">' +
    '<table class="wide" style="width:600px;border-collapse:collapse"><tr><td>wide</td></tr></table></body>');
  const o = await overflowOf(page);
  expect(o?.px).toBe(210);
  expect(o?.selector).toContain('table');
});
