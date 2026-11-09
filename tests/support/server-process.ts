// A REAL server process for e2e that must stop / start the server between tests (UC-17) or cut Postgres (DB down, D-UI4) - something
// the shared Playwright server cannot do (its `webServer` lives for the whole run, holding the test DB lock).
//
// - Its own DB `<test DB>_live_test` (one DB - one server, D19): created if missing, migrations applied when the server starts.
// - The server connects to Postgres THROUGH `TcpProxy` -> the test cuts / reconnects the DB without touching the shared container.
// - `kill()` = kill the process (Windows: TerminateProcess - like a real server death); `shutdown()` = graceful stop over the IPC channel
//   `{ type: 'shutdown' }` (D18 - Windows cannot send SIGINT to a child process); `start()` again on the same port.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseUrl, loadDotEnv } from '../../server/config';
import { TcpProxy } from './tcp-proxy';

loadDotEnv();
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function liveDbUrl(): string {
  const url = new URL(databaseUrl(process.env, 'test'));
  url.pathname = `/${url.pathname.slice(1).replace(/_test$/, '')}_live_test`;
  return url.toString();
}

async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  target.pathname = '/postgres';
  const client = new pg.Client({ connectionString: target.toString(), connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

export class ServerProcess {
  readonly port: number;
  readonly baseUrl: string;
  readonly dbProxy: TcpProxy;
  readonly logs: string[] = [];
  #dbProxyPort = 0;
  #child: ChildProcess | null = null;
  #exited: Promise<void> = Promise.resolve();
  #exitCode: number | null = null;
  readonly #env: NodeJS.ProcessEnv;

  private constructor(port: number, dbProxy: TcpProxy, env: NodeJS.ProcessEnv) {
    this.port = port;
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.dbProxy = dbProxy;
    this.#env = env;
  }

  /**
   * Create its own DB (if missing), set up the Postgres proxy, start the server (test mode - has `/api/__test/reset`). `env` adds variables to
   * the server process (e.g. `CLAUDE_CONFIG_DIR` - the sample transcript folder of the transcript screen screenshots).
   */
  static async launch(opts: { env?: NodeJS.ProcessEnv } = {}): Promise<ServerProcess> {
    const url = liveDbUrl();
    await ensureDatabase(url);
    const target = new URL(url);
    const proxy = new TcpProxy({ host: target.hostname, port: Number(target.port || 5432) });
    const sp = new ServerProcess(await freePort(), proxy, opts.env ?? {});
    sp.#dbProxyPort = await proxy.start();
    await sp.start();
    await sp.api('POST', '/api/__test/reset'); // a clean DB for each test; start() after kill() does NOT wipe (UC-17 needs the old data)
    return sp;
  }

  get running(): boolean {
    return this.#child !== null;
  }

  /** PID of the running server process (`null` once it is off). */
  get pid(): number | null {
    return this.#child?.pid ?? null;
  }

  /** Exit code of the latest stop (`null` = killed, did not exit by itself). */
  get exitCode(): number | null {
    return this.#exitCode;
  }

  async start(): Promise<void> {
    if (this.#child) return;
    // A test-only delay, to make a slow start (a loaded machine) happen on demand: a setup that must stay inside its limit is proven with it.
    const delay = Number(process.env.LOOPS_TEST_START_DELAY_MS ?? 0);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const db = new URL(liveDbUrl());
    db.hostname = '127.0.0.1';
    db.port = String(this.#dbProxyPort);
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.#env, LOOPS_PORT: String(this.port), LOOPS_TEST_MODE: '1', DATABASE_URL: db.toString() };
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/main.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    child.stdout?.on('data', (b) => this.logs.push(String(b)));
    child.stderr?.on('data', (b) => this.logs.push(String(b)));
    let exited = false;
    this.#exited = new Promise((resolve) =>
      child.once('exit', (code) => {
        exited = true;
        this.#exitCode = code;
        resolve();
      }),
    );
    this.#child = child;
    const deadline = Date.now() + 30_000;
    for (;;) {
      if (exited) throw new Error(`the server exited during startup:\n${this.logs.join('')}`);
      try {
        const res = await fetch(`${this.baseUrl}/api/health`);
        if (res.status === 200) break;
      } catch {
        // not listening yet
      }
      if (Date.now() > deadline) throw new Error(`the server did not come up within 30 seconds:\n${this.logs.join('')}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  /** Kill the process (like a server death), wait until it is fully gone. */
  async kill(): Promise<void> {
    const child = this.#child;
    if (!child) return;
    this.#child = null;
    child.kill();
    await this.#exited;
  }

  /** Graceful stop: send `{ type: 'shutdown' }` over IPC (like Ctrl+C), wait for the process to exit by itself (<= 15 seconds, killed after that). */
  async shutdown(): Promise<void> {
    const child = this.#child;
    if (!child) return;
    this.#child = null;
    child.send({ type: 'shutdown' });
    const timer = setTimeout(() => child.kill(), 15_000);
    await this.#exited;
    clearTimeout(timer);
  }

  async stop(): Promise<void> {
    await this.kill();
    await this.dbProxy.stop();
  }

  /** Cut Postgres (every open connection is RST, the port stops listening) / reconnect on the same port. */
  async cutDb(): Promise<void> {
    await this.dbProxy.stop();
  }
  async restoreDb(): Promise<void> {
    await this.dbProxy.start(this.#dbProxyPort);
  }

  async api<T = unknown>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<{ status: number; body: T }> {
    const res = await fetch(this.baseUrl + path, {
      method,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
  }
}
