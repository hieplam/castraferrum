// E2E goals G19 and G20, the goal cards page on the real build: Accept and Refuse change the card and the history, a one-way card shows no
// start time, a two-way card with no start time says that it waits for Accept, and the token budget of a loop saves in the editor. All real: browser, build, Fastify, Postgres (test mode).
// No test reaches the network: the console runs on the fake `gh` (`LOOPS_GH_BIN`), which holds the issue of the card. The name that shows
// is `hieplam/tribe`.
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { en } from '../../shared/i18n/en';
import { createFakeGh, type FakeGh } from '../support/fake-gh-kit';
import { api, createLoop, reset } from '../support/form-kit';
import { goalCardId, PROPOSED_ISSUE, seedCard } from '../support/goal-loop-cards-world';
import { repoId } from '../support/preview-world';
import { liveDbUrl, ServerProcess } from '../support/server-process';

test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });

const PAGE = `/repos/${repoId('api')}/goal-cards`;

/** One console on the fake `gh` and its own database. `gh.read()` shows every call that the console made. */
async function launch(door: 'one-way' | 'two-way'): Promise<{ sp: ServerProcess; gh: FakeGh; pool: pg.Pool; stop(): Promise<void> }> {
  const gh = createFakeGh();
  const sp = await ServerProcess.launch({ env: { LOOPS_GH_BIN: gh.script, FAKE_GH_WORLD: gh.world } });
  const pool = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
  await seedCard(sp, pool, door, gh);
  return {
    sp,
    gh,
    pool,
    stop: async () => {
      await sp.stop();
      await pool.end();
      gh.dispose();
    },
  };
}

test('G19: Accept leaves no waiting card, and the history shows the card as accepted', async ({ page }) => {
  const c = await launch('two-way');
  try {
    await page.goto(`${c.sp.baseUrl}${PAGE}`);
    await expect(page.getByTestId('card-status')).toHaveAttribute('data-status', 'proposed');
    await page.getByTestId('card-accept').click();
    await expect(page.getByTestId('card-status')).toHaveCount(0);
    await expect(page.getByTestId('card-history').locator('[data-status="accepted"]').first()).toContainText('Billing reports for the finance team');
    const row = await c.pool.query('SELECT state FROM goal_cards WHERE id = $1', [goalCardId('proposed')]);
    expect(row.rows[0].state).toBe('accepted');
  } finally {
    await c.stop();
  }
});

test('G19: Refuse leaves no waiting card, shows the card as refused and closes its issue', async ({ page }) => {
  const c = await launch('two-way');
  try {
    await page.goto(`${c.sp.baseUrl}${PAGE}`);
    await page.getByTestId('card-refuse').click();
    await expect(page.getByTestId('card-status')).toHaveCount(0);
    await expect(page.getByTestId('card-history').locator('[data-status="refused"]').first()).toContainText('Billing reports for the finance team');
    expect(c.gh.read().issues.find((i) => i.number === PROPOSED_ISSUE)?.state).toBe('CLOSED');
  } finally {
    await c.stop();
  }
});

test('G19: each earlier card with a chevron is a link that opens its GitHub issue in a new tab', async ({ page }) => {
  const c = await launch('two-way');
  try {
    await page.goto(`${c.sp.baseUrl}${PAGE}`);
    const cells = page.getByTestId('card-history').locator('.cell');
    await expect(cells.first()).toBeVisible();
    expect(await cells.count()).toBeGreaterThan(0);
    for (const cell of await cells.all()) {
      await expect(cell.locator('.chev')).toHaveCount(1);
      await expect(cell).toHaveAttribute('href', /^https:\/\/github\.com\/hieplam\/tribe\/issues\/\d+$/);
      await expect(cell).toHaveAttribute('target', '_blank');
      expect(await cell.evaluate((el) => el.tagName)).toBe('A');
    }
  } finally {
    await c.stop();
  }
});

test('G20: the one-way card shows the one-way sentence and no start time', async ({ page }) => {
  const c = await launch('one-way');
  try {
    await page.goto(`${c.sp.baseUrl}${PAGE}`);
    await expect(page.getByTestId('card-door')).toHaveAttribute('data-status', 'one-way');
    await expect(page.getByTestId('goal-card')).toContainText(en['goalLoop.cards.oneWayText']);
    await expect(page.getByTestId('goal-card')).not.toContainText('22:14');
    await expect(page.getByTestId('goal-card')).not.toContainText(en['goalLoop.cards.twoWayOff']);
  } finally {
    await c.stop();
  }
});

test('G20: a two-way card with no start time says that it waits for Accept', async ({ page }) => {
  const c = await launch('two-way');
  try {
    await c.pool.query('UPDATE goal_cards SET start_after = NULL WHERE id = $1', [goalCardId('proposed')]);
    await page.goto(`${c.sp.baseUrl}${PAGE}`);
    await expect(page.getByTestId('goal-card')).toContainText(en['goalLoop.cards.twoWayOff']);
    await expect(page.getByTestId('goal-card')).not.toContainText('22:14');
  } finally {
    await c.stop();
  }
});

test('G20: the token budget 1000 saves in the editor of a stopped probe loop and is there after a reload', async ({ page, request }) => {
  await reset(request);
  const loop = await createLoop(request, { name: 'Budget editor loop', prompt: 'Do the claimed task', cron: '0 0 1 1 *' });
  const probe = { command: ['node', 'epic.mjs', 'next', '--probe'] };
  expect((await api(request, 'PUT', `/api/loops/${loop.id}/probe`, probe)).status).toBe(200);
  await page.goto(`/loops/${loop.id}/edit`);
  await expect(page.getByTestId('probe-token-budget')).toHaveValue('');
  await page.getByTestId('probe-token-budget').fill('0');
  await page.getByTestId('form-submit').click();
  await expect(page.getByText(en['goalLoop.editor.tokenBudgetError'])).toBeVisible();
  await page.getByTestId('probe-token-budget').fill('1000');
  await page.getByTestId('form-submit').click();
  await expect(page).toHaveURL(new RegExp(`/loops/${loop.id}$`));
  const saved = (await api<{ probe: { tokenBudget: number | null } }>(request, 'GET', `/api/loops/${loop.id}/probe`)).body.probe;
  expect(saved.tokenBudget).toBe(1000);
  await page.goto(`/loops/${loop.id}/edit`);
  await page.reload();
  await expect(page.getByTestId('probe-token-budget')).toHaveValue('1000');
});
