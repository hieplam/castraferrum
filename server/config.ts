import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

type Env = Record<string, string | undefined>;

export type Config = {
  port: number;
  databaseUrl: string;
  /** LOOPS_TEST_MODE=1: only runs with a DB named *_test (the test routes wipe data). */
  testMode: boolean;
  /**
   * Registers the Mock executor (project owner 19/10/2026: "remove mock entirely" — the real console has only Claude). On in test mode,
   * or with `LOOPS_MOCK_EXECUTOR=1` (api-smoke runs the normal build) — both only with a DB named *_test.
   */
  mockExecutor: boolean;
  /** The `gh` program of the Git host. `LOOPS_GH_BIN` replaces it (tests point it at the fake gh), only with a DB named *_test. */
  ghBin: string;
  /** The `epic.mjs` that the loop of a started goal card runs. `LOOPS_EPIC_SCRIPT` replaces it. */
  epicScript: string;
  /** The UI build (vite build) that Fastify serves. */
  webRoot: string;
  /**
   * Test mode: `LOOPS_TRANSCRIPT_PAGE=<n>` forces transcript pages down to n entries (e2e scroll-up auto-load on a small fixture).
   * A normal run ignores this variable (default page 50 entries / 4 MB).
   */
  transcriptPage?: { minEntries: number; maxBytes: number };
  /** `LOOPS_NOTIFY_WEBHOOK`: a URL that gets one JSON post for each new notice. Unset (the default) = nothing is pushed. */
  notifyWebhook?: string;
};

/** Where the epic-loop skill keeps its script. */
export const defaultEpicScript = (): string => join(homedir(), '.claude', 'skills', 'epic-loop', 'scripts', 'epic.mjs');

/** Loads .env if present; environment variables that are already set are left untouched. */
export function loadDotEnv(): void {
  const file = join(ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function readPort(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name}=${raw} is not a valid port (1–65535)`);
  }
  return port;
}

/** Postgres URL of compose.yml: `main` = the loops DB, `test` = the loops_test DB. */
export function databaseUrl(env: Env, which: 'main' | 'test'): string {
  const fromEnv = which === 'main' ? env.DATABASE_URL : env.LOOPS_TEST_DATABASE_URL;
  if (fromEnv) return fromEnv;
  const pgPort = readPort(env, 'LOOPS_PG_PORT', 55432);
  return `postgres://loops:loops@127.0.0.1:${pgPort}/${which === 'main' ? 'loops' : 'loops_test'}`;
}

/** Hides the password when printing a URL to the log. */
export function redactUrl(url: string): string {
  return url.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:***@');
}

export function loadConfig(env: Env = process.env): Config {
  const testMode = env.LOOPS_TEST_MODE === '1';
  const url = env.DATABASE_URL ?? databaseUrl(env, testMode ? 'test' : 'main');
  const dbName = new URL(url).pathname.slice(1);
  if (testMode && !dbName.endsWith('_test')) {
    throw new Error(`LOOPS_TEST_MODE=1 may only run against a DB named *_test, but it points at "${dbName}"`);
  }
  const mockFlag = env.LOOPS_MOCK_EXECUTOR === '1';
  if (mockFlag && !dbName.endsWith('_test')) {
    throw new Error(`LOOPS_MOCK_EXECUTOR=1 may only run against a DB named *_test, but it points at "${dbName}"`);
  }
  const ghBin = env.LOOPS_GH_BIN;
  if (ghBin && !dbName.endsWith('_test')) {
    throw new Error(`LOOPS_GH_BIN may only run against a DB named *_test, but it points at "${dbName}"`);
  }
  return {
    port: readPort(env, 'LOOPS_PORT', 7070),
    databaseUrl: url,
    testMode,
    mockExecutor: testMode || mockFlag,
    ghBin: ghBin || 'gh',
    epicScript: env.LOOPS_EPIC_SCRIPT || defaultEpicScript(),
    webRoot: join(ROOT, 'dist', 'web'),
    ...(env.LOOPS_NOTIFY_WEBHOOK ? { notifyWebhook: webhookUrl(env.LOOPS_NOTIFY_WEBHOOK) } : {}),
    ...(testMode && env.LOOPS_TRANSCRIPT_PAGE ? { transcriptPage: transcriptPage(env.LOOPS_TRANSCRIPT_PAGE) } : {}),
  };
}

function webhookUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('LOOPS_NOTIFY_WEBHOOK is not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('LOOPS_NOTIFY_WEBHOOK must start with http:// or https://');
  return raw;
}

function transcriptPage(raw: string): { minEntries: number; maxBytes: number } {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`LOOPS_TRANSCRIPT_PAGE=${raw} must be an integer ≥ 1`);
  return { minEntries: n, maxBytes: 4 * 1024 * 1024 };
}
