// Acceptance journey of the goal-driven loop (epic 217, task Z2, all goals): every new screen on the real, built app, at 1440 px (desktop)
// and at 390 px (phone layout, touch), each once in the light and once in the dark system theme. The steps live in
// tests/support/acceptance-goal-loop.ts. Screenshots: reports/acceptance/goal-loop-<width>-<theme>-<nn>-<step>.png.
import { expect, test } from '@playwright/test';
import { GOAL_LOOP_STEPS, goalLoopJourney, type Theme } from '../support/acceptance-goal-loop';

const WIDTHS = [
  { label: '1440', viewport: { width: 1440, height: 900 }, phone: false },
  { label: '390', viewport: { width: 390, height: 844 }, phone: true },
] as const;

for (const w of WIDTHS) {
  for (const theme of ['light', 'dark'] as const satisfies readonly Theme[]) {
    test.describe(`goal loop acceptance at ${w.label} px, ${theme} system theme`, () => {
      test.use({ viewport: w.viewport, colorScheme: theme, hasTouch: w.phone, isMobile: w.phone, timezoneId: 'Asia/Ho_Chi_Minh' });

      test(`every new screen of the goal-driven loop at ${w.label} px (${theme})`, { tag: '@acceptance' }, async ({ page, request }) => {
        test.setTimeout(300_000);
        const steps = await goalLoopJourney(page, request, { label: w.label, theme, phone: w.phone, touch: w.phone });
        expect(steps).toBe(GOAL_LOOP_STEPS);
      });
    });
  }
}
