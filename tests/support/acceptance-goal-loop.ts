/// <reference lib="dom" />
// The acceptance journey of the goal-driven loop (epic 217, task Z2, all goals): every new screen on the real build, opened the way the
// owner opens it. The journey reaches 13 states: the 11 approved preview ids of design/ds/STATES.md (probe-waiting, probe-blocked,
// probe-held, run-held, probe-complete, gate-queue, gate-failed, goal-rows, scoreboard, card-two-way, card-one-way) and the 2 items
// with no preview id (the hold banner, which is the notices banner of spec section 5, and the probe settings of the editor).
//
// Each world is built by the seed function of the visual test of the task that owns the screen (tests/support/goal-loop-*-world.ts), on a
// console of its own (test mode, its own database, the fake `gh`, a temp CLAUDE_CONFIG_DIR). A seed resets the database, so the journey
// opens the first page of each world by its URL; every other state of the same world is reached by a tap or a click. Each step asserts
// the state word (the `goalLoop.*` keys of shared/i18n/en.ts), the URL, no element with a native `title`, no sideways scroll, then saves
// `reports/acceptance/goal-loop-<label>-<theme>-<nn>-<step>.png`. tests/e2e/acceptance.goal-loop.spec.ts runs it at 1440 and 390 px,
// each in the light and the dark system theme.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import pg from 'pg';
import { createFakeGh } from './fake-gh-kit';
import { seedCard } from './goal-loop-cards-world';
import { gateJobId, seedGateQueue } from './goal-loop-gate-world';
import { seedGoalRows } from './goal-loop-goals-world';
import { seedProbeState, type ProbeSeedState } from './goal-loop-probe-world';
import { seedScoreboard, type TestApi } from './goal-loop-score-world';
import { PREVIEW_NOW, repoId } from './preview-world';
import { liveDbUrl, ServerProcess } from './server-process';
import { t } from './ui-text';

export type Theme = 'light' | 'dark';
export type JourneyOpts = {
  /** First part of the screenshot names: the width (`1440`, `390`). */
  label: string;
  /** The theme the system asks for (the context's `colorScheme`). The journey stays in it. */
  theme: Theme;
  /** The phone layout (navigation bar, tab bar) instead of the desktop one (top bar). */
  phone: boolean;
  /** Tap instead of click (a touch screen). */
  touch: boolean;
};

/** The number of steps one journey asserts (the ratchet of task Z2: 0 before it). */
export const GOAL_LOOP_STEPS = 13;

const SHOTS = 'reports/acceptance';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** The hold of the `held` world opened at 13:58 and ends at 19:00, Vietnam time (`goalLoop.states.held` of design/ds/preview/data.js). */
const HOLD_OPENED = '13:58';
const HOLD_UNTIL = '19:00';

/** The `action` of the last probe line of each probe state (spec 2.1). */
const ACTION: Record<ProbeSeedState, string> = { waiting: 'wait', blocked: 'blocked', held: 'hold', complete: 'done' };

/** Runs the whole journey; returns the number of steps it asserted (the ratchet of task Z2). */
export async function goalLoopJourney(page: Page, request: APIRequestContext, o: JourneyOpts): Promise<number> {
  const config = realpathSync(mkdtempSync(join(tmpdir(), 'cf-acceptance-goal-loop-')));
  // Every tick of the console that calls `gh` runs on the fake one, never on the real `gh` of this machine.
  const gh = createFakeGh();
  const sp = await ServerProcess.launch({ env: { CLAUDE_CONFIG_DIR: config, LOOPS_GH_BIN: gh.script, FAKE_GH_WORLD: gh.world } });
  const db = new pg.Pool({ connectionString: liveDbUrl(), max: 2 });
  // The seeds call the test routes of this console through the test's request context.
  const api: TestApi = {
    api: async (method, path, body) => ({ status: (await request.fetch(`${sp.baseUrl}${path}`, { method, ...(body === undefined ? {} : { data: body }) })).status() }),
  };
  let steps = 0;

  const press = (l: Locator) => (o.touch ? l.tap() : l.click());
  const path = () => new URL(page.url()).pathname;

  /** Builds a world on an empty database with the clocks at PREVIEW_NOW, then opens `to` (a path of that world). */
  async function open<T>(seed: () => Promise<T>, to: (seeded: T) => string): Promise<void> {
    // Leave the app first: its reads would race the reset's TRUNCATE (castraferrum#170).
    await page.goto('about:blank');
    const seeded = await seed();
    await page.clock.setFixedTime(PREVIEW_NOW);
    await page.goto(`${sp.baseUrl}${to(seeded)}`);
  }

  /** One step: do it, assert what it shows, then check the page as a whole and save its screenshot. */
  async function step(name: string, body: () => Promise<void>): Promise<void> {
    await test.step(`${o.label} ${o.theme}: ${name}`, async () => {
      await body();
      await expect(page.getByTestId('conn'), `${name}: the database`).toHaveAttribute('data-db', 'ok');
      await expect(page.locator('html'), `${name}: theme`).toHaveAttribute('data-theme', o.theme);
      expect(page.context().pages(), `${name}: a link opened a second page`).toHaveLength(1);
      await expect(page.getByTestId(o.phone ? 'topbar' : 'tabbar'), `${name}: the bar of the other layout`).toBeHidden();
      // Native tooltips are banned (design/ds/SYSTEM.md); the page must never scroll sideways (390 px included).
      expect(await page.locator('[title]').count(), `${name}: elements with a native title tooltip`).toBe(0);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      expect(scrollWidth, `${name}: the page scrolls sideways`).toBeLessThanOrEqual(innerWidth);
      // No hover, no focus ring, no caret in the shot.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      if (!o.touch) await page.mouse.move(1, 1);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // A full-page capture paints the fixed bars (tab bar, action bar) where the first screen ends, over the content. So the
      // screen is made as tall as the page for the shot, which puts them at the real bottom, then given its size back.
      await page.evaluate(() => window.scrollTo(0, 0));
      const view = page.viewportSize();
      const tall = await page.evaluate(() => document.documentElement.scrollHeight);
      if (view && tall > view.height) await page.setViewportSize({ width: view.width, height: tall });
      steps += 1;
      const file = `${SHOTS}/goal-loop-${o.label}-${o.theme}-${String(steps).padStart(2, '0')}-${name}.png`;
      await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
      if (view && tall > view.height) await page.setViewportSize(view);
    });
  }

  const probeWorld = (state: ProbeSeedState) => () => seedProbeState(api, db, state, { projectsDir: join(config, 'projects') });

  /** The loop page of a probe world shows `state`: the pill word, the now card, the figures, the last probe line and Recent runs. */
  async function loopShows(state: ProbeSeedState, word: string) {
    await expect(page.getByTestId('loop-status'), `the state word of ${state}`).toHaveText(word);
    await expect(page).toHaveURL(new RegExp(`/loops/${UUID}$`));
    await expect(page.getByTestId('loop-header')).toHaveAttribute('data-status', state);
    await expect(page.getByTestId('now-card')).toHaveAttribute('data-state', state);
    await expect(page.getByTestId('fig-goals')).toBeVisible();
    await expect(page.getByTestId('probe-line')).toContainText(`"action":"${ACTION[state]}"`);
    await expect(page.getByTestId('probe-line')).toContainText(t('goalLoop.probe.copy'));
    await expect(page.getByTestId('recent-runs').getByTestId('run-row').first()).toBeVisible();
  }

  try {
    await step('probe-waiting', async () => {
      await open(probeWorld('waiting'), (s) => s.path);
      await loopShows('waiting', t('goalLoop.loop.waiting'));
      await expect(page.getByTestId('now-card')).toContainText(t('goalLoop.now.waiting'));
      await expect(page.getByTestId('loop-stop')).toBeVisible();
    });

    await step('probe-blocked', async () => {
      await open(probeWorld('blocked'), (s) => s.path);
      await loopShows('blocked', t('goalLoop.loop.blocked'));
      await expect(page.getByText(t('goalLoop.blocked.title'), { exact: true })).toBeVisible();
      await expect(page.getByTestId('blocker-row')).toHaveCount(2);
      await expect(page.getByTestId('blocker-row').first()).toContainText(t('goalLoop.blocked.issue', { n: 31, title: 'Migration 14 fails' }));
      await expect(page.getByTestId('blocker-row').first()).toContainText(t('goalLoop.blocked.tasks.other', { n: 3 }));
    });

    let loopPath = '';
    await step('probe-held', async () => {
      await open(probeWorld('held'), (s) => s.path);
      await loopShows('held', t('goalLoop.loop.held'));
      loopPath = path();
      await expect(page.getByText(t('goalLoop.hold.title'), { exact: true })).toBeVisible();
      await expect(page.getByTestId('hold-list')).toContainText(t('goalLoop.hold.until', { t: HOLD_UNTIL }));
      await expect(page.getByTestId('recent-runs').locator('[data-testid=run-row][data-status=held]')).toHaveCount(1);
    });

    await step('run-held', async () => {
      const held = page.getByTestId('recent-runs').locator('[data-testid=run-row][data-status=held]');
      await held.scrollIntoViewIfNeeded();
      await press(held);
      // The pill of the head is the first "Held" of the page (the log under it ends with a line that says Held as well).
      await expect(page.getByTestId('run-page').getByText(t('goalLoop.run.held'), { exact: true }).first(), 'the state word of the held run').toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/runs/${UUID}$`));
      await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'held');
      await expect(page.getByTestId('run-banner')).toContainText(t('goalLoop.run.banner', { at: HOLD_OPENED, until: HOLD_UNTIL }));
      await expect(page.getByTestId('run-transcript').getByTestId('tx-entry')).toHaveCount(6, { timeout: 10_000 });
      await expect(page.getByTestId('run-resume')).toHaveCount(0);
    });

    // The notices banner (spec section 5, "Notices, holds: .banner.is-warn"): the hold banner on top of the loop page, back from the run.
    await step('hold-banner', async () => {
      await press(page.getByTestId('back-to-loop'));
      await expect(page.getByTestId('banner-hold'), 'the words of the hold banner').toHaveText(t('goalLoop.banner.hold', { t: HOLD_UNTIL }));
      await expect(page).toHaveURL(new RegExp(`${loopPath}$`));
      await expect(page.getByTestId('banner-hold')).toHaveAttribute('role', 'status');
      await expect(page.getByTestId('loop-status')).toHaveText(t('goalLoop.loop.held'));
    });

    await step('probe-complete', async () => {
      await open(probeWorld('complete'), (s) => s.path);
      await loopShows('complete', t('goalLoop.loop.complete'));
      loopPath = path();
      await expect(page.getByTestId('period-status').first()).toHaveText(t('goalLoop.period.goalMet'));
      await expect(page.getByTestId('loop-start')).toBeVisible();
    });

    // The probe settings: the loop of `probe-complete` is stopped, so the editor's Probe group is open for changes.
    await step('probe-settings', async () => {
      await press(page.getByTestId('loop-edit'));
      await expect(page.getByText(t('goalLoop.editor.title'), { exact: true }), 'the title of the Probe group').toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${loopPath}/edit$`));
      const enabled = page.getByTestId('probe-enabled');
      await expect(enabled).toHaveAttribute('aria-checked', 'true');
      await expect(enabled).toBeEnabled();
      await expect(enabled).toContainText(t('goalLoop.editor.enabled'));
      await expect(page.getByLabel(t('goalLoop.editor.command'), { exact: true })).toHaveValue('node\nprobe.mjs');
      await expect(page.getByLabel(t('goalLoop.editor.claim'), { exact: true })).toHaveValue('');
      await expect(page.getByLabel(t('goalLoop.editor.release'), { exact: true })).toHaveValue('');
      await expect(page.getByLabel(t('goalLoop.editor.laneEnv'), { exact: true })).toHaveValue('');
      await expect(page.getByLabel(t('goalLoop.editor.basePort'), { exact: true })).toHaveValue('');
      await expect(page.getByLabel(t('goalLoop.editor.tokenBudget'), { exact: true })).toHaveValue('');
      await expect(page.getByTestId('probe-restart-stop')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('probe-restart-resume')).toHaveText(t('goalLoop.editor.restartResume'));
      for (const hint of ['commandHint', 'claimHint', 'releaseHint', 'basePortHint', 'tokenBudgetHint', 'laneEnvHint'] as const) {
        await expect(page.getByText(t(`goalLoop.editor.${hint}`), { exact: true }), hint).toBeVisible();
      }
    });

    const gateQueue = `/repos/${repoId('api')}/gate`;
    await step('gate-queue', async () => {
      await open(() => seedGateQueue(api, db), () => gateQueue);
      const jobs = page.getByTestId('gate-job');
      await expect(jobs, 'the five jobs of the gate').toHaveCount(5);
      const words = { running: 'goalLoop.gate.running', queued: 'goalLoop.gate.queued', needs_ratification: 'goalLoop.gate.needsRatification', merged: 'goalLoop.gate.merged', failed: 'goalLoop.gate.failed' } as const;
      for (const [status, key] of Object.entries(words)) await expect(page.locator(`[data-testid=gate-job][data-status=${status}]`).first(), `the state word ${status}`).toContainText(t(key));
      await expect(page).toHaveURL(new RegExp(`${gateQueue}$`));
      await expect(page.getByTestId('gate-switch')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('gate-ratify')).toHaveText(t('goalLoop.gate.ratify'));
    });

    await step('gate-failed', async () => {
      const failed = page.locator(`[data-testid=gate-job][data-job-id="${gateJobId(41)}"]`);
      await failed.scrollIntoViewIfNeeded();
      await press(failed.getByRole('link'));
      await expect(page.getByTestId('gate-job-status'), 'the state word of job 41').toHaveText(t('goalLoop.gate.failed'));
      await expect(page).toHaveURL(new RegExp(`${gateQueue}/jobs/${gateJobId(41)}$`));
      await expect(page.getByTestId('gate-step')).toHaveCount(8);
      await expect(page.getByTestId('gate-output')).toBeVisible();
      await expect(page.getByTestId('gate-requeue')).toHaveText(t('goalLoop.gate.requeue'));
    });

    await step('goal-rows', async () => {
      await open(() => seedGoalRows(api, db), (s) => s.page);
      const rows = page.getByTestId('goal-rows');
      await expect(rows.getByText(t('goalLoop.loop.complete'), { exact: true }), 'the word of a goal row that passes').toHaveCount(3);
      await expect(rows.getByText(t('goalLoop.gate.failed'), { exact: true }), 'the word of a goal row that fails').toHaveCount(5);
      await expect(page).toHaveURL(new RegExp(`/loops/${UUID}/goals$`));
      await expect(page.getByTestId('goal-row')).toHaveCount(8);
      await expect(page.getByTestId('standing-row')).toHaveCount(2);
      await expect(page.getByTestId('goal-loop-row')).toHaveCount(2);
      await expect(page.getByTestId('goal-figures')).toContainText(t('goalLoop.goals.figure'));
    });

    await step('scoreboard', async () => {
      await open(() => seedScoreboard(api, db), () => '/scoreboard');
      await expect(page.getByTestId('score-causes').getByText(t('goalLoop.score.noCheck'), { exact: true }), 'the word of a cause with no check').toHaveCount(1);
      await expect(page).toHaveURL(/\/scoreboard$/);
      await expect(page.getByTestId('score-cause')).toHaveCount(3);
      await expect(page.getByTestId('score-week')).toHaveCount(5);
      await expect(page.getByTestId('score-figures')).toContainText(t('goalLoop.score.causes'));
    });

    const cards = `/repos/${repoId('api')}/goal-cards`;
    for (const door of ['two-way', 'one-way'] as const) {
      await step(`card-${door}`, async () => {
        await open(() => seedCard(api, db, door), () => cards);
        await expect(page.getByTestId('card-status'), 'the state word of the proposed card').toHaveText(t('goalLoop.card.proposed'));
        await expect(page.getByTestId('card-door'), 'the door word').toHaveText(t(door === 'two-way' ? 'goalLoop.door.twoWay' : 'goalLoop.door.oneWay'));
        await expect(page).toHaveURL(new RegExp(`${cards}$`));
        await expect(page.getByTestId('card-door')).toHaveAttribute('data-status', door);
        await expect(page.getByTestId('card-accept')).toHaveText(t('goalLoop.cards.accept'));
        await expect(page.getByTestId('card-refuse')).toHaveText(t('goalLoop.cards.refuse'));
        const history = page.getByTestId('card-history').locator('[data-card-id]');
        await expect(history).toHaveCount(3);
        for (const [state, key] of [['accepted', 'goalLoop.card.accepted'], ['refused', 'goalLoop.card.refused'], ['started', 'goalLoop.card.started']] as const) {
          await expect(history.and(page.locator(`[data-status=${state}]`)), `the word of an earlier card that is ${state}`).toContainText(t(key));
        }
      });
    }

    console.log(`[acceptance] goal loop ${o.label} ${o.theme}: acceptance steps: ${steps}`);
    return steps;
  } finally {
    await sp.stop();
    await db.end();
    gh.dispose();
    rmSync(config, { recursive: true, force: true });
  }
}
