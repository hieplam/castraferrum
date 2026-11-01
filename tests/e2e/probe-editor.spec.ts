// E2E goal G28, the Probe group of the editor on the real build: the fields save and come back after a reload, an active loop shows the group
// disabled with the hint to stop it first, and a server message shows under its field. All real: browser, build, Fastify, Postgres (test mode).
import { expect, test } from '@playwright/test';
import { api, createLoop, reset } from '../support/form-kit';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const COMMAND = ['node', 'epic.mjs', 'next', '--probe'];
const CLAIM = ['node', 'epic.mjs', 'claim', '{key}'];
const RELEASE = ['node', 'epic.mjs', 'release', '{key}', '{reason}'];

test('the probe fields save with the loop and are there again after a reload', async ({ page, request }) => {
  await reset(request);
  const loop = await createLoop(request, { name: 'Probe editor loop' });
  await page.goto(`/loops/${loop.id}/edit`);
  await expect(page.getByTestId('probe-enabled')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('probe-enabled').click();
  await page.getByTestId('probe-command').fill(COMMAND.join('\n'));
  await page.getByTestId('probe-claim').fill(CLAIM.join('\n'));
  await page.getByTestId('probe-release').fill(RELEASE.join('\n'));
  await page.getByTestId('probe-restart-resume').click();
  await page.getByTestId('probe-base-port').fill('7251');
  await page.getByTestId('probe-lane-env').fill('DB_NAME=loops_{slot}_test\nPORT={port}');
  await page.getByTestId('form-submit').click();
  await expect(page).toHaveURL(new RegExp(`/loops/${loop.id}$`));

  const saved = (await api<Json>(request, 'GET', `/api/loops/${loop.id}/probe`)).body.probe as Json;
  expect(saved).toMatchObject({
    command: COMMAND,
    claim: CLAIM,
    release: RELEASE,
    restartPolicy: 'resume',
    laneBasePort: 7251,
    laneEnv: { DB_NAME: 'loops_{slot}_test', PORT: '{port}' },
  });

  await page.goto(`/loops/${loop.id}/edit`);
  await page.reload();
  await expect(page.getByTestId('probe-enabled')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('probe-command')).toHaveValue(COMMAND.join('\n'));
  await expect(page.getByTestId('probe-claim')).toHaveValue(CLAIM.join('\n'));
  await expect(page.getByTestId('probe-release')).toHaveValue(RELEASE.join('\n'));
  await expect(page.getByTestId('probe-restart')).toHaveAttribute('data-value', 'resume');
  await expect(page.getByTestId('probe-base-port')).toHaveValue('7251');
  await expect(page.getByTestId('probe-lane-env')).toHaveValue('DB_NAME=loops_{slot}_test\nPORT={port}');

  // Switch off and save: the probe is deleted.
  await page.getByTestId('probe-enabled').click();
  await page.getByTestId('form-submit').click();
  await expect(page).toHaveURL(new RegExp(`/loops/${loop.id}$`));
  expect((await api<Json>(request, 'GET', `/api/loops/${loop.id}/probe`)).body.probe).toBeNull();
});

test('an active loop shows the Probe group disabled with the hint to stop it first', async ({ page, request }) => {
  await reset(request);
  const loop = await createLoop(request, { name: 'Probe active loop' });
  expect((await api(request, 'PUT', `/api/loops/${loop.id}/probe`, { command: COMMAND })).status).toBe(200);
  expect((await api(request, 'POST', `/api/loops/${loop.id}/start`)).status).toBe(200);
  await page.goto(`/loops/${loop.id}/edit`);
  await expect(page.getByTestId('probe-enabled')).toBeDisabled();
  await expect(page.getByTestId('probe-enabled')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('probe-command')).toBeDisabled();
  await expect(page.getByTestId('probe-command')).toHaveValue(COMMAND.join('\n'));
  await expect(page.getByTestId('probe-stop-first')).toHaveText('Stop the loop first. The probe can change only while the loop is stopped.');
});

test('a claim command with no {key} shows the server message under its field, and nothing is saved', async ({ page, request }) => {
  await reset(request);
  const loop = await createLoop(request, { name: 'Probe error loop' });
  await page.goto(`/loops/${loop.id}/edit`);
  await page.getByTestId('probe-enabled').click();
  await page.getByTestId('probe-command').fill(COMMAND.join('\n'));
  await page.getByTestId('probe-claim').fill('node\nepic.mjs\nclaim');
  await page.getByTestId('form-submit').click();
  await expect(page.getByTestId('error-probe-claim')).toHaveText('The claim command needs the placeholder {key}');
  await expect(page).toHaveURL(new RegExp(`/loops/${loop.id}/edit$`));
  expect((await api<Json>(request, 'GET', `/api/loops/${loop.id}/probe`)).body.probe).toBeNull();
});
