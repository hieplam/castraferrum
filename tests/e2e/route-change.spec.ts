/// <reference lib="dom" />
// Issues 413 and 414: in full e2e runs the iPhone journey changed the URL, and the next page came 5 s later (the expiry of a React
// transition), so the step failed. React Router wraps each route change in `startTransition` unless `useTransitions` is false. React
// renders a transition in slices, one scheduler task (`MessageChannel`) per slice, and in WebKit such a task can wait a long time on a
// loaded machine. This test holds every scheduler task back, so the order is pinned on each run: a click on a loop row must show the
// loop page with no scheduler task at all, as React renders an update from a click before the event ends.
import { expect, test } from '@playwright/test';
import { closeDb, createLoop, reset } from '../support/form-kit';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });
test.afterAll(closeDb);

type HeldWindow = { holdScheduler(): void; releaseScheduler(): number };

test('UC-03: a click on a loop row shows the loop page while the React scheduler gets no task', { tag: '@UC-03' }, async ({ page, request }) => {
  await reset(request);
  const loop = await createLoop(request, { name: 'Route change loop', prompt: 'p', cron: '0 3 * * *' });
  await page.addInitScript(() => {
    let held = false;
    const queue: (() => void)[] = [];
    const Channel = window.MessageChannel;
    window.MessageChannel = function () {
      const channel = new Channel();
      const slot = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage')!;
      Object.defineProperty(channel.port1, 'onmessage', {
        configurable: true,
        get: () => slot.get!.call(channel.port1),
        set(fn: (this: MessagePort, ev: MessageEvent) => void) {
          slot.set!.call(channel.port1, function (this: MessagePort, ev: MessageEvent) {
            if (held) queue.push(() => fn.call(this, ev));
            else fn.call(this, ev);
          });
        },
      });
      return channel;
    } as unknown as typeof MessageChannel;
    const w = window as unknown as HeldWindow;
    w.holdScheduler = () => {
      held = true;
    };
    w.releaseScheduler = () => {
      held = false;
      const n = queue.length;
      for (const run of queue.splice(0)) run();
      return n;
    };
  });

  // The loop page loads its data once, so the cache holds it and the next visit needs no request.
  await page.goto(`/loops/${loop.id}`);
  await expect(page.getByTestId('loop-status')).toBeVisible();
  await page.getByTestId('nav-loops').click();
  await expect(page.getByTestId('loop-row')).toHaveCount(1);

  await page.evaluate(() => (window as unknown as HeldWindow).holdScheduler());
  await page.getByTestId('loop-row').getByTestId('loop-name').click();
  await expect(page).toHaveURL(new RegExp(`/loops/${loop.id}$`));
  await expect(page.getByTestId('loop-status'), 'the loop page, with every scheduler task held back').toBeVisible();
  await expect(page.getByTestId('loop-row')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as HeldWindow).releaseScheduler());
});
