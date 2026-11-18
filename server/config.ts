import { existsSync } from 'node:fs';
import { homedir, type networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

type Env = Record<string, string | undefined>;

export type Config = {
  port: number;
  /** Interface to listen on (`--host`, `--remote`, `LOOPS_HOST`). Default `127.0.0.1`. */
  host: string;
  /** `--help` was given: the server prints `USAGE` and exits 0 before it opens the database. */
  help: boolean;
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

export const USAGE = `Usage: npm start -- [flags]

Flags (a value is written --name=value or --name value):
  --host=<address>   LOOPS_HOST=<address>   interface to listen on (default 127.0.0.1; 0.0.0.0 = every IPv4 interface)
  --remote           LOOPS_REMOTE=1         same as --host=0.0.0.0 (phones on the same Wi-Fi)
  --port=<1-65535>   LOOPS_PORT=<port>      API and UI port (default 7070)
  --help             -                      print this text and exit 0

Order of precedence: argument, then npm_config_<name> (npm start --host=...), then LOOPS_<NAME> (environment or .env), then the default.
--remote beats npm_config_host and LOOPS_HOST. --remote and --host as arguments together are an error.`;

/** A bad command line. main.ts prints the message and the usage, then exits 2. */
export class UsageError extends Error {
  readonly usage = USAGE;
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export type ParsedArgs = { host?: string; port?: string; remote: boolean; help: boolean };

const VALUE_FLAGS = new Set(['host', 'port']);
const SWITCH_FLAGS = new Set(['remote', 'help']);

/** Parses --name=value, --name value and the switches --remote and --help. Throws UsageError for anything else. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const out: ParsedArgs = { remote: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      throw new UsageError(`unexpected argument ${arg} (write a value as --name=value)`);
    }
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);
    if (SWITCH_FLAGS.has(name)) {
      if (inline !== undefined) throw new UsageError(`--${name} takes no value`);
      out[name as 'remote' | 'help'] = true;
    } else if (VALUE_FLAGS.has(name)) {
      let value = inline;
      if (value === undefined) {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) throw new UsageError(`--${name} needs a value`);
        value = next;
        i++;
      }
      if (value === '') throw new UsageError(`--${name} needs a value`);
      out[name as 'host' | 'port'] = value;
    } else {
      throw new UsageError(`unknown flag --${name}`);
    }
  }
  if (out.remote && out.host !== undefined) throw new UsageError('--remote and --host cannot be used together');
  return out;
}

/**
 * Value of a flag from npm: `npm start --host=x` arrives as npm_config_host=x. A bare --host arrives as "true"
 * (measured with npm 11.17.0), which is not a value.
 */
function npmValue(env: Env, name: string): string | undefined {
  const raw = env[`npm_config_${name}`];
  if (raw === undefined || raw === '') return undefined;
  if (raw === 'true') throw new UsageError(`--${name} needs a value: write --${name}=<value>`);
  return raw;
}

export function loadConfig(env: Env = process.env, argv: readonly string[] = []): Config {
  const args = parseArgs(argv);
  // npm hands `npm start --remote` over as npm_config_remote=true; --no-remote and --remote=false arrive as an empty string.
  const remote = args.remote || env.npm_config_remote === 'true' || env.LOOPS_REMOTE === '1';
  const host = args.host ?? (remote ? '0.0.0.0' : (npmValue(env, 'host') ?? (env.LOOPS_HOST || '127.0.0.1')));
  const npmPort = args.port === undefined ? npmValue(env, 'port') : undefined;
  const port =
    args.port !== undefined
      ? readPort({ '--port': args.port }, '--port', 7070)
      : npmPort !== undefined
        ? readPort({ npm_config_port: npmPort }, 'npm_config_port', 7070)
        : readPort(env, 'LOOPS_PORT', 7070);
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
    port,
    host,
    help: args.help,
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

/** The line that the server prints when it listens beyond loopback without a sign-in (spec D4). */
export const NETWORK_WARNING = 'Warning: anyone on this network can open the console and run agents on this machine.';

/** True for the addresses that only this machine can reach: `127.x.x.x`, `::1` and `localhost`. */
export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || /^127\./.test(host);
}

/**
 * The URLs, besides `127.0.0.1`, that the console answers on (spec D3). `0.0.0.0` (and `::`) gives one URL per non-internal IPv4
 * address of `interfaces` (`os.networkInterfaces()`). A specific address gives that address. A loopback address gives none.
 */
export function networkUrls(host: string, port: number, interfaces: ReturnType<typeof networkInterfaces>): string[] {
  if (isLoopbackHost(host)) return [];
  if (host !== '0.0.0.0' && host !== '::') return [`http://${host.includes(':') ? `[${host}]` : host}:${port}`];
  const urls: string[] = [];
  for (const list of Object.values(interfaces)) {
    for (const nic of list ?? []) if (nic.family === 'IPv4' && !nic.internal) urls.push(`http://${nic.address}:${port}`);
  }
  return urls;
}
