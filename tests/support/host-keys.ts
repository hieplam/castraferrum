/// <reference lib="dom" />
// The iPhone stand-in runs in Playwright's WebKit on a Windows machine. A click with Shift or Control makes react-router leave
// the link to the browser, and WebKit then opens it in a second page while the first page stays where it was, so a tap looks
// lost (issue 362). The trace of a failure shows that second page. A real iPhone has no such keys. The likely source of the
// key is the real keyboard of the machine (WebCore.dll imports GetKeyState); that source is not proven. This holds for every source.
import type { Page } from '@playwright/test';

/** Every mouse event in `page` reads as unmodified, as on a phone. Call it before the first navigation. */
export async function ignoreHostKeys(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const key of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey'] as const) Object.defineProperty(MouseEvent.prototype, key, { get: () => false });
  });
}
