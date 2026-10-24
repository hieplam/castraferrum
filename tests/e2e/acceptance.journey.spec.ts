// Acceptance journey (UI uplift, task U27, goal G9): one normal session on the real, built app, driven through the UI only, at
// 1440 px (desktop) and at 390 px (phone layout, touch), each starting once in the light and once in the dark theme. The steps
// live in tests/support/acceptance-journey.ts; tests/e2e/acceptance.iphone.spec.ts runs the same journey in WebKit as an
// iPhone 13 through the machine's LAN address. Screenshots: reports/acceptance/<width>-<theme>-<nn>-<step>.png.
import { expect, test } from '@playwright/test';
import { JOURNEY_STEPS, journey, type Theme } from '../support/acceptance-journey';
import { closeDb } from '../support/form-kit';

test.afterAll(closeDb);

const WIDTHS = [
  { label: '1440', viewport: { width: 1440, height: 900 }, phone: false },
  { label: '390', viewport: { width: 390, height: 844 }, phone: true },
] as const;

for (const w of WIDTHS) {
  for (const theme of ['light', 'dark'] as const satisfies readonly Theme[]) {
    test.describe(`acceptance at ${w.label} px, ${theme} system theme`, () => {
      test.use({ viewport: w.viewport, colorScheme: theme, hasTouch: w.phone, isMobile: w.phone, timezoneId: 'Asia/Ho_Chi_Minh' });

      test(`G9: a normal session works end to end at ${w.label} px (${theme} first)`, { tag: '@acceptance' }, async ({ page, request }) => {
        test.setTimeout(120_000);
        const steps = await journey(page, request, { label: w.label, theme, phone: w.phone, touch: w.phone });
        expect(steps).toBe(JOURNEY_STEPS);
      });
    });
  }
}
