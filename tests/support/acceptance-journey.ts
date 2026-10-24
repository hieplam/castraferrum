/// <reference lib="dom" />
// The acceptance journey of the UI uplift (task U27, goal G9): one normal session on the real, built app, driven through the UI
// only. Register a repo with the folder picker, create a loop, start it, watch the live run and its transcript, stop it, edit it,
// change the theme and the language. Each step asserts what the user sees (text, state pill, URL), checks that the page has no
// native tooltip (`[title]`) and does not scroll sideways, then saves a screenshot to
// `reports/acceptance/<label>-<theme>-<nn>-<step>.png`. tests/e2e/acceptance.journey.spec.ts runs it in Chromium at 1440 and
// 390 px; tests/e2e/acceptance.iphone.spec.ts runs it in WebKit as an iPhone 13 through the machine's LAN address.
//
// The loop runs the Claude executor on a repo folder named `lc-fake-claude-*`, so test mode answers with the fake Claude of
// server/adapters/executors/claude/test-mode-query.ts (no real Claude is opened; `[soak:600]` keeps the run going until Stop).
// The fake writes no transcript file, so the journey plays Claude Code's part: it writes `<session id>.jsonl` where Claude Code
// would, while the run page is open, and the page must show each entry as it arrives.
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { pickRepo } from './form-kit';
import { t, tv } from './ui-text';

export type Theme = 'light' | 'dark';
export type JourneyOpts = {
  /** First part of the screenshot names: the width (`1440`, `390`) or the device (`iphone13`). */
  label: string;
  /** The theme the system asks for (the context's `colorScheme`): the journey starts in it and switches to the other one. */
  theme: Theme;
  /** The phone layout (tab bar, pushed pages, Settings for the theme) instead of the desktop one (top bar, theme button). */
  phone: boolean;
  /** Tap instead of click (a touch screen). */
  touch: boolean;
  /** The origin the page must be served from (the LAN address of the iPhone run); unset = the configured baseURL. */
  origin?: string;
};

/** The number of steps one journey asserts (the ratchet of task U27: 0 before it). */
export const JOURNEY_STEPS = 20;

const SHOTS = 'reports/acceptance';
const REPO_FOLDER = 'lc-fake-claude-journey';
const LOOP_NAME = 'Review open pull requests';
const LOOP_NAME_EDITED = 'Review open pull requests daily';
const PROMPT = '[soak:600] Review the open pull requests and list the ones that wait for a review.';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

/** The `--bg` value of a theme in design/ds/tokens.css, as `getComputedStyle` writes it. */
function tokenBg(theme: Theme): string {
  const tokens = readFileSync(fileURLToPath(new URL('../../design/ds/tokens.css', import.meta.url)), 'utf8');
  const block = tokens.split(':root[data-theme="dark"]')[theme === 'light' ? 0 : 1];
  const hex = /--bg:\s*(#[0-9a-f]{6})/i.exec(block ?? '')?.[1];
  if (!hex) throw new Error(`design/ds/tokens.css has no --bg for the ${theme} theme`);
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** Where the server looks for Claude Code's transcript files (server/compose.ts): `${CLAUDE_CONFIG_DIR ?? ~/.claude}/projects`. */
const transcriptRoot = () => join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');

/** One line of a Claude Code session file. */
function jsonl(sessionId: string, row: Record<string, unknown>): string {
  return `${JSON.stringify({ sessionId, isSidechain: false, timestamp: new Date().toISOString(), ...row })}\n`;
}

/** Runs the whole journey; returns the number of steps it asserted (the ratchet of task U27). */
export async function journey(page: Page, request: APIRequestContext, o: JourneyOpts): Promise<number> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cf-acceptance-')));
  const repoDir = join(root, REPO_FOLDER);
  mkdirSync(repoDir);
  const txDir = join(transcriptRoot(), `cf-acceptance-${o.label}-${o.theme}`);
  const other: Theme = o.theme === 'light' ? 'dark' : 'light';
  let theme: Theme = o.theme;
  let steps = 0;

  const press = (l: Locator) => (o.touch ? l.tap() : l.click());
  const nav = (tab: 'loops' | 'repos' | 'settings') => page.getByTestId(o.phone ? `tab-${tab}` : `nav-${tab}`);
  const path = () => new URL(page.url()).pathname;
  let lang: 'en' | 'vi' = 'en';
  /**
   * Goes to a tab like a user: the top bar on the desktop; on the phone the tab bar, after leaving a pushed page (which has no
   * tab bar) through its back link to the Loops tab.
   */
  async function goTab(tab: 'loops' | 'repos' | 'settings') {
    if (o.phone && (await page.getByTestId('tabbar').count()) === 0) {
      await press(page.getByRole('link', { name: (lang === 'en' ? t : tv)('nav.loops'), exact: true }));
      await expect(page).toHaveURL(/\/$/);
      if (tab === 'loops') return;
    }
    await press(nav(tab));
  }

  /** One step: do it, assert what it shows, then check the page as a whole and save its screenshot. */
  async function step(name: string, body: () => Promise<void>): Promise<void> {
    await test.step(`${o.label} ${theme}: ${name}`, async () => {
      await body();
      await expect(page.locator('html'), `${name}: theme`).toHaveAttribute('data-theme', theme);
      if (o.origin) expect(new URL(page.url()).origin, `${name}: served from the LAN address`).toBe(o.origin);
      // Native tooltips are banned (design/ds/SYSTEM.md); the page must never scroll sideways (390 px included).
      expect(await page.locator('[title]').count(), `${name}: elements with a native title tooltip`).toBe(0);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      expect(scrollWidth, `${name}: the page scrolls sideways`).toBeLessThanOrEqual(innerWidth);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      // A full-page capture paints the fixed bars (tab bar, action bar) where the first screen ends, over the content. So the
      // screen is made as tall as the page for the shot, which puts them at the real bottom, then given its size back.
      await page.evaluate(() => window.scrollTo(0, 0));
      const view = page.viewportSize();
      const tall = await page.evaluate(() => document.documentElement.scrollHeight);
      if (view && tall > view.height) await page.setViewportSize({ width: view.width, height: tall });
      steps += 1;
      const file = `${SHOTS}/${o.label}-${theme}-${String(steps).padStart(2, '0')}-${name}.png`;
      await page.screenshot({ path: file, animations: 'disabled', caret: 'hide' });
      if (view && tall > view.height) await page.setViewportSize(view);
    });
  }

  /** The current tab is `tab`: the tab bar on the phone, the top bar on the desktop (the other bar is hidden). */
  async function onTab(tab: 'loops' | 'repos' | 'settings') {
    await expect(nav(tab)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId(o.phone ? 'tabbar' : 'topbar')).toBeVisible();
    await expect(page.getByTestId(o.phone ? 'topbar' : 'tabbar')).toBeHidden();
  }

  try {
    expect((await request.post('/api/__test/reset')).status()).toBe(204);

    await step('loops-first-visit', async () => {
      await page.goto('/');
      await onTab('loops');
      await expect(page.getByTestId('home-empty')).toContainText(t('howto.title'));
      await expect(page.getByTestId('list-create')).toHaveText(t('loops.new'));
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(tokenBg(theme));
    });

    await step('repos-empty', async () => {
      await goTab('repos');
      await expect(page).toHaveURL(/\/repos$/);
      await onTab('repos');
      await expect(page.getByTestId('repo-empty')).toContainText(t('repos.emptyTitle'));
    });

    await step('folder-picker', async () => {
      await press(page.getByTestId('repo-add'));
      await expect(page.getByTestId('folder-picker')).toBeVisible();
      await page.locator('[data-testid="folder-list"][data-loading="false"]:not([data-path=""])').waitFor();
      await page.getByTestId('repo-path').fill(root);
      await page.getByTestId('repo-path').press('Enter');
      await expect(page.getByTestId('folder-list')).toHaveAttribute('data-path', root);
      const row = page.locator(`[data-testid=folder-row][data-name="${REPO_FOLDER}"]`);
      await expect(page.getByTestId('folder-row')).toHaveCount(1);
      await press(row);
      await expect(row).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('folder-target')).toHaveAttribute('data-path', repoDir);
      await expect(page.getByTestId('repo-name')).toHaveValue(REPO_FOLDER);
    });

    await step('repo-registered', async () => {
      await press(page.getByTestId('repo-submit'));
      await expect(page.getByTestId('folder-picker')).toHaveCount(0);
      await expect(page.getByTestId('repo-row')).toHaveCount(1);
      await expect(page.getByTestId('repo-row-name')).toHaveText(REPO_FOLDER);
      if (!o.phone) await expect(page.getByTestId('nav-repos-count')).toHaveText('1');
    });

    await step('editor-new', async () => {
      await goTab('loops');
      await expect(page).toHaveURL(/\/$/);
      await press(page.getByTestId('list-create'));
      await expect(page).toHaveURL(/\/loops\/new$/);
      await page.getByTestId('f-name').fill(LOOP_NAME);
      await page.getByTestId('f-prompt').fill(PROMPT);
      await pickRepo(page, REPO_FOLDER);
      await expect(page.getByTestId('f-repo')).toContainText(REPO_FOLDER);
      await expect(page.getByTestId('f-executor-claude')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('sched-out')).toHaveAttribute('data-state', 'ok');
      await expect(page.getByTestId('form-submit')).toHaveText(t('editor.create'));
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    });

    let loopUrl = '';
    await step('loop-created', async () => {
      await press(page.getByTestId('form-submit'));
      await expect(page).toHaveURL(/\/loops\/[0-9a-f-]{36}$/);
      loopUrl = path();
      await expect(page.getByTestId('loop-header')).toContainText(LOOP_NAME);
      await expect(page.getByTestId('loop-status')).toHaveText(t('status.stopped'));
      await expect(page.getByTestId('loop-start')).toHaveText(t('act.start'));
      if (o.phone) await expect(page.getByTestId('loop-repo')).toHaveText(REPO_FOLDER);
    });

    await step('loop-running', async () => {
      await press(page.getByTestId('loop-start'));
      await expect(page.getByTestId('loop-status')).toHaveText(t('status.running'));
      await expect(page.getByTestId('loop-stop')).toHaveText(t('act.stopLoop'));
      await expect(page.getByTestId('live-log').locator('[data-seq]').first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId('run-row')).toHaveCount(1);
    });

    let sessionId = '';
    await step('run-live', async () => {
      const run = page.getByTestId('run-row').first();
      await run.scrollIntoViewIfNeeded();
      await press(run);
      await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
      await expect(page.getByTestId('run-header')).toHaveAttribute('data-status', 'running');
      await expect(page.getByTestId('run-of')).toContainText(LOOP_NAME);
      const sid = page.getByTestId('run-session');
      await expect(sid).toHaveAttribute('data-session-id', UUID);
      sessionId = (await sid.getAttribute('data-session-id')) ?? '';
      await expect(page.getByTestId('run-transcript-title')).toHaveText(t('run.transcript'));
    });

    await step('transcript-live', async () => {
      // Claude Code writes the session file while the page is open: the prompt, a sentence, a tool call and its result.
      mkdirSync(txDir, { recursive: true });
      const file = join(txDir, `${sessionId}.jsonl`);
      appendFileSync(file, jsonl(sessionId, { type: 'user', message: { role: 'user', content: PROMPT } }));
      appendFileSync(file, jsonl(sessionId, { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'I will list the open pull requests first.' }] } }));
      appendFileSync(file, jsonl(sessionId, { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_journey_1', name: 'Bash', input: { command: 'gh pr list --state open' } }] } }));
      appendFileSync(file, jsonl(sessionId, { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_journey_1', content: '3 open pull requests' }] } }));
      const tx = page.getByTestId('run-transcript');
      await expect(tx.locator('[data-kind=tool_use]')).toContainText('gh pr list --state open', { timeout: 10_000 });
      await expect(tx.locator('[data-kind=assistant]').first()).toContainText('I will list the open pull requests first.');
      await expect(tx.locator('[data-kind=tool_result]')).toContainText('3 open pull requests');
      // A line written later shows up without a reload: the transcript follows the run.
      appendFileSync(file, jsonl(sessionId, { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Two of them wait for a review.' }] } }));
      await expect(tx.locator('[data-kind=assistant]').last()).toContainText('Two of them wait for a review.', { timeout: 10_000 });
      await expect(tx).toContainText(t('now.following'));
      await tx.scrollIntoViewIfNeeded();
    });

    await step('loop-stopped', async () => {
      await press(page.getByTestId('back-to-loop'));
      await expect(page).toHaveURL(new RegExp(`${loopUrl}$`));
      await press(page.getByTestId('loop-stop'));
      await expect(page.getByTestId('stop-dialog')).toBeVisible();
      await press(page.getByTestId('stop-confirm'));
      await expect(page.getByTestId('stop-dialog')).toHaveCount(0);
      await expect(page.getByTestId('loop-status')).toHaveText(t('status.stopped'), { timeout: 10_000 });
      await expect(page.getByTestId('loop-start')).toBeVisible();
    });

    await step('editor-edit', async () => {
      await press(page.getByTestId('loop-edit'));
      await expect(page).toHaveURL(new RegExp(`${loopUrl}/edit$`));
      await expect(page.getByTestId('f-name')).toHaveValue(LOOP_NAME);
      await expect(page.getByTestId('f-prompt')).toHaveValue(PROMPT);
      await page.getByTestId('f-name').fill(LOOP_NAME_EDITED);
      await expect(page.getByTestId('form-submit')).toHaveText(t('editor.save'));
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    });

    await step('loop-edited', async () => {
      await press(page.getByTestId('form-submit'));
      await expect(page).toHaveURL(new RegExp(`${loopUrl}$`));
      await expect(page.getByTestId('loop-header')).toContainText(LOOP_NAME_EDITED);
      await expect(page.getByTestId('loop-status')).toHaveText(t('status.stopped'));
    });

    await step('loops-list', async () => {
      await goTab('loops');
      await expect(page).toHaveURL(/\/$/);
      await onTab('loops');
      const row = page.getByTestId('loop-row');
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute('data-status', 'stopped');
      await expect(row.getByTestId('loop-name')).toHaveText(LOOP_NAME_EDITED);
    });

    // The theme: the desktop's top-bar button, the phone's Settings (the top bar is hidden there).
    theme = other;
    await step('theme-switched', async () => {
      if (o.phone) {
        await goTab('settings');
        await expect(page).toHaveURL(/\/settings$/);
        await press(page.getByTestId(`settings-theme-${other}`));
        await expect(page.getByTestId(`settings-theme-${other}`)).toHaveAttribute('aria-checked', 'true');
      } else {
        await press(page.getByTestId('toggle-theme'));
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', other);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(tokenBg(other));
    });

    await step('settings-english', async () => {
      if (path() !== '/settings') await goTab('settings');
      await expect(page).toHaveURL(/\/settings$/);
      await onTab('settings');
      await expect(page.getByTestId('settings-lang-en')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('settings-theme')).toHaveAttribute('data-value', other);
      await expect(nav('settings')).toContainText(t('nav.settings'));
    });

    // The language: Vietnamese, then back to English. Expected strings come from shared/i18n/vi.ts (CLAUDE.md, language rule).
    await step('settings-vietnamese', async () => {
      await press(page.getByTestId('settings-lang-vi'));
      lang = 'vi';
      await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
      await expect(page.getByTestId('settings-lang-vi')).toHaveAttribute('aria-checked', 'true');
      await expect(nav('settings')).toContainText(tv('nav.settings'));
      await expect(nav('loops')).toContainText(tv('nav.loops'));
    });

    await step('loops-vietnamese', async () => {
      await goTab('loops');
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByTestId('loop-row').getByTestId('row-status')).toContainText(tv('status.stopped'));
      await expect(page.getByTestId('loop-row').getByTestId('loop-name')).toHaveText(LOOP_NAME_EDITED); // data is never translated
    });

    await step('loop-vietnamese', async () => {
      await press(page.getByTestId('loop-row').getByTestId('loop-name'));
      await expect(page).toHaveURL(new RegExp(`${loopUrl}$`));
      await expect(page.getByTestId('loop-status')).toHaveText(tv('status.stopped'));
      await expect(page.getByTestId('loop-start')).toHaveText(tv('act.start'));
      await expect(page.getByTestId('loop-edit')).toHaveText(tv('act.edit'));
    });

    // Back to English and to the theme the journey started in: both choices apply at once, on every bar.
    await step('english-again', async () => {
      await goTab('settings');
      await press(page.getByTestId('settings-lang-en'));
      lang = 'en';
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(nav('loops')).toContainText(t('nav.loops'));
      await expect(page.getByTestId('settings-lang-en')).toHaveAttribute('aria-checked', 'true');
    });

    theme = o.theme;
    await step('theme-back', async () => {
      await press(page.getByTestId(`settings-theme-${o.theme}`));
      await expect(page.locator('html')).toHaveAttribute('data-theme', o.theme);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(tokenBg(o.theme));
      await goTab('loops');
      await expect(page.getByTestId('loop-row').getByTestId('row-status')).toContainText(t('status.stopped'));
    });

    console.log(`[acceptance] ${o.label} ${o.theme}: acceptance steps: ${steps}`);
    return steps;
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(txDir, { recursive: true, force: true });
  }
}
