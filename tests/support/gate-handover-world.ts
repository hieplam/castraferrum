// A loop on the real server that ends a claimed run with `PR_OPEN`, with the fake `gh` and labels in a fake task tracker. Used by `tests/api/gate-handover.test.ts`,
// and by a later test of the whole chain from a run to a merge. It sits here because a test that imports a `.test.ts` file runs that file's tests a second time.
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type pg from 'pg';
import { createPgRepositories } from '../../server/adapters/postgres/repositories';
import { FAKE_CLAUDE_DIR_PREFIX } from '../../server/adapters/executors/claude/test-mode-query';
import type { ComposedServer } from '../../server/compose';
import { loopBody } from './api-kit';

const FAKE_LABELS = resolve('tests/support/fake-labels.mjs');
export const HANDOVER_PR_URL = 'https://github.com/fake/repo/pull/7';
export const HANDOVER_GITHUB_REPO = 'fake/repo';
export const handOverPrompt = (pr = HANDOVER_PR_URL) => `Handle one task [echo-env] [run-end:PR_OPEN:${pr}]`;

export type HandOverLoop = { repoId: string; loopId: string; dir: string; labels: string };

export type HandOverOptions = {
  /** The tasks that the probe offers. */
  queue?: string[];
  /** `repo_gate.enabled`. */
  gate: boolean;
  prompt?: string;
  /** Use this folder as the repository of the loop. Its name must start with `lc-fake-claude-`. Default: a new empty folder. */
  dir?: string;
};

/** Registers a repository, sets its gate, and starts a loop with a probe. The first tick claims the first task, and the run ends with `PR_OPEN`. */
export async function startHandOverLoop(server: Pick<ComposedServer, 'app'>, pool: pg.Pool, options: HandOverOptions): Promise<HandOverLoop> {
  const dir = options.dir ?? realpathSync(mkdtempSync(join(tmpdir(), FAKE_CLAUDE_DIR_PREFIX)));
  const post = async (url: string, payload?: Record<string, unknown>, method: 'POST' | 'PUT' = 'POST') => {
    const res = await server.app.inject({ method, url, ...(payload ? { payload } : {}) });
    if (res.statusCode >= 300) throw new Error(`${method} ${url} -> ${res.statusCode} ${res.body}`);
    return (res.body ? res.json() : null) as { id: string };
  };
  const repoId = (await post('/api/repos', { path: dir, name: `handover ${dir.slice(-6)}` })).id;
  await createPgRepositories(pool).gate.setRepoGate(repoId, { enabled: options.gate, githubRepo: HANDOVER_GITHUB_REPO, checkCommand: [] }, new Date());
  const executor = { kind: 'claude', config: { model: 'opus', effort: 'medium' } };
  const loopId = (await post('/api/loops', loopBody({ repoId, prompt: options.prompt ?? handOverPrompt(), maxConcurrent: 1, executor }))).id;
  const labels = mkdtempSync(join(tmpdir(), 'lc-handover-'));
  writeFileSync(join(labels, 'queue.json'), JSON.stringify(options.queue ?? ['141']));
  writeFileSync(join(labels, 'calls.log'), '');
  const argv = (...rest: string[]) => [process.execPath, FAKE_LABELS, labels, ...rest];
  await post(`/api/loops/${loopId}/probe`, { command: argv('next'), claim: argv('claim', '{key}'), release: argv('release', '{key}', '--if-claimed', '--reason', '{reason}') }, 'PUT');
  await post(`/api/loops/${loopId}/start`);
  return { repoId, loopId, dir, labels };
}

/** The lines of `calls.log` of the fake task tracker. */
export const labelCalls = (loop: Pick<HandOverLoop, 'labels'>) => readFileSync(join(loop.labels, 'calls.log'), 'utf8').split('\n').filter(Boolean);
