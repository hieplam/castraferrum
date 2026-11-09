// Test kit for the API tests (tests/api): a real server from composeServer (the exact wiring of main.ts) on the test Postgres, test mode,
// fast ticks; plus its own pool to cross-check with SELECT and an SSE reader that waits on events (no hard sleeps).
import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { composeServer, type ComposeOptions, type ComposedServer } from '../../server/compose';
import { databaseUrl } from '../../server/config';

export const TEST_DB_URL = databaseUrl(process.env, 'test');

/** One Mock "second" in the API tests (1 000 ms for real). */
export const MOCK_TICK_MS = 40;

export type ApiServer = ComposedServer & {
  /** `http://127.0.0.1:<port>` - only available after `listen()` (the SSE test needs a real port to read the stream with fetch). */
  listen(): Promise<string>;
};

/**
 * `ticker: false` leaves every background service stopped. A test that writes gate jobs through the repository needs it:
 * the gate service of a ticking server takes a queued job between the `enqueue` and the `takeNext` of the test and writes step 1 itself.
 */
export async function startApi(over: Partial<ComposeOptions> = {}, opts: { ticker?: boolean } = {}): Promise<ApiServer> {
  const server = await composeServer({
    databaseUrl: TEST_DB_URL,
    testMode: true,
    tickEveryMs: 100,
    mockTickMs: MOCK_TICK_MS,
    sseHeartbeatMs: 150,
    dbWaitMs: 5000,
    ...over,
  });
  if (opts.ticker !== false) server.startTicker();
  return {
    ...server,
    async listen() {
      await server.app.listen({ host: '127.0.0.1', port: 0 });
      return `http://127.0.0.1:${(server.app.server.address() as AddressInfo).port}`;
    },
  };
}

export function testPool(): pg.Pool {
  const pool = new pg.Pool({ connectionString: TEST_DB_URL, max: 2 });
  pool.on('error', () => {});
  return pool;
}

/** Temp folder used as the default repo of the API tests (phase 2: a loop must be attached to a repo). */
export const TEST_REPO_DIR = mkdtempSync(join(tmpdir(), 'lc-api-repo-'));
let currentRepoId = '';

/**
 * `POST /api/__test/reset` (wipes everything, repos included) then registers the default repo `TEST_REPO_DIR` again through `POST /api/repos`;
 * `loopBody()` then attaches this repo by itself. Returns the repo id.
 */
export async function resetApi(server: Pick<ComposedServer, 'app'>): Promise<string> {
  const reset = await server.app.inject({ method: 'POST', url: '/api/__test/reset' });
  if (reset.statusCode !== 204) throw new Error(`reset -> ${reset.statusCode}`);
  const repo = await server.app.inject({ method: 'POST', url: '/api/repos', payload: { path: TEST_REPO_DIR, name: 'repo test' } });
  if (repo.statusCode !== 201) throw new Error(`POST /api/repos -> ${repo.statusCode} ${repo.body}`);
  currentRepoId = repo.json().id as string;
  return currentRepoId;
}

/** A minimal valid loop (attached to the repo of the latest `resetApi`); a long Mock (600 "seconds") so the run stays `running` until the test stops it itself. */
export function loopBody(over: Record<string, unknown> = {}) {
  return {
    name: `loop ${Math.random().toString(36).slice(2, 8)}`,
    description: 'description',
    prompt: 'Do task A then B',
    repoId: currentRepoId,
    cron: '0 0 1 1 *', // once a year - no schedule tick gets into the test unless the test advances the clock
    timezone: 'Asia/Ho_Chi_Minh',
    timeoutSec: 600,
    executor: { kind: 'mock', config: { durationSec: 600, failRate: 0 } },
    ...over,
  };
}

// ---------------------------------------------------------------- SSE

export type SseEvent = { event: string; id: string | null; data: unknown; comment?: string };

/**
 * Reads an SSE stream with fetch. `waitFor(pred)` returns the first event (even one that arrived earlier) matching `pred`, or throws when
 * `timeoutMs` runs out / the stream closes. Comment lines (`:ping`, `:ok`) also become events with `event = ':'`.
 */
export async function openSse(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const res = await fetch(url, { headers: { accept: 'text/event-stream', ...headers }, signal: controller.signal });
  const events: SseEvent[] = [];
  const waiters = new Set<() => void>();
  let ended = false;
  const notify = () => {
    for (const w of [...waiters]) w();
  };

  const pump = (async () => {
    if (!res.body) return;
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          events.push(parseFrame(frame));
          notify();
        }
      }
    } catch {
      // cancelled by the test side
    } finally {
      ended = true;
      notify();
    }
  })();

  return {
    res,
    events,
    get ended() {
      return ended;
    },
    /** Data events (comments dropped). */
    data(): SseEvent[] {
      return events.filter((e) => e.event !== ':');
    },
    waitFor(pred: (e: SseEvent) => boolean, timeoutMs = 5000): Promise<SseEvent> {
      return new Promise((resolve, reject) => {
        const check = () => {
          const hit = events.find(pred);
          if (hit) return done(() => resolve(hit));
          if (ended) return done(() => reject(new Error(`SSE stream closed before the awaited event arrived (${describe(events)})`)));
        };
        const timer = setTimeout(() => done(() => reject(new Error(`Timed out after ${timeoutMs} ms waiting for SSE (${describe(events)})`))), timeoutMs);
        const done = (fn: () => void) => {
          clearTimeout(timer);
          waiters.delete(check);
          fn();
        };
        waiters.add(check);
        check();
      });
    },
    /** Wait for the server to close the stream. */
    async waitEnd(timeoutMs = 5000): Promise<void> {
      if (ended) return;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms waiting for the SSE stream to close`)), timeoutMs);
        const check = () => {
          if (!ended) return;
          clearTimeout(timer);
          waiters.delete(check);
          resolve();
        };
        waiters.add(check);
      });
    },
    async close(): Promise<void> {
      controller.abort();
      await pump;
    },
  };
}

function parseFrame(frame: string): SseEvent {
  let event = 'message';
  let id: string | null = null;
  const data: string[] = [];
  const comments: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) comments.push(line.slice(1));
    else if (line.startsWith('event: ')) event = line.slice(7);
    else if (line.startsWith('id: ')) id = line.slice(4);
    else if (line.startsWith('data: ')) data.push(line.slice(6));
  }
  if (data.length === 0 && comments.length > 0) return { event: ':', id: null, data: null, comment: comments.join('\n') };
  return { event, id, data: data.length ? JSON.parse(data.join('\n')) : null };
}

function describe(events: SseEvent[]): string {
  return events.map((e) => (e.event === ':' ? `:${e.comment}` : e.event)).join(', ') || 'nothing received';
}
