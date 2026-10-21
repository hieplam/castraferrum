// npm run api-smoke: walks a loop through its whole life over HTTP ONLY, against a real server (a `node --import tsx
// server/main.ts` process, the normal build, no LOOPS_TEST_MODE), and checks every step against a SELECT straight
// into Postgres:
//
//   created -> start: execution #1, round #1 running (session mock-...) -> working... -> stop: cancelled, execution #1 stopped
//   -> start: execution #2 -> restart -> interrupted, execution #2 server_down, loop stopped -> sessionIds of execution #1 = 1, #2 = 1 ok
//
// "restart" = KILL the process (like a crash / power cut; on Windows `kill` is TerminateProcess) and start it again; in the
// end the second instance is shut down gracefully over IPC and must exit 0. A route that returns hard-coded JSON /
// never touches the DB disagrees with the SELECT, so exit 1.
//
// DB: LOOPS_SMOKE_DATABASE_URL, by default the test DB (LOOPS_TEST_DATABASE_URL / loops_test); the real `loops` DB is never
// touched. Nothing is deleted: the loop has its own name and every count is filtered by its id. Port: a free one is picked.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const dbUrl =
  process.env.LOOPS_SMOKE_DATABASE_URL ??
  process.env.LOOPS_TEST_DATABASE_URL ??
  `postgres://loops:loops@127.0.0.1:${process.env.LOOPS_PG_PORT ?? 55432}/loops_test`;

const out = (s) => process.stdout.write(s);
class SmokeError extends Error {}
const check = (cond, msg) => {
  if (!cond) throw new SmokeError(msg);
};

/** A free port on 127.0.0.1. */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Starts the real server and waits for `/api/health` to answer 200. The server log is kept to print on failure. */
async function startServer(port, logs) {
  // The normal build (no test mode) but with the Mock executor: the real console only offers Claude, Mock is for tests, on a *_test DB.
  const env = { ...process.env, LOOPS_PORT: String(port), DATABASE_URL: dbUrl, LOOPS_MOCK_EXECUTOR: '1' };
  delete env.LOOPS_TEST_MODE;
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/main.ts'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout.on('data', (b) => logs.push(String(b)));
  child.stderr.on('data', (b) => logs.push(String(b)));
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  const deadline = Date.now() + 30_000;
  for (;;) {
    const alive = await Promise.race([exited.then(() => false), new Promise((r) => setTimeout(() => r(true), 200))]);
    check(alive, `the server exited early while starting`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.status === 200) return { child, exited };
    } catch {
      // the port is not listening yet
    }
    check(Date.now() < deadline, 'the server did not come up within 30 seconds');
  }
}

function client(port) {
  const base = `http://127.0.0.1:${port}/api`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { base, call };
}

/** Reads the SSE log stream of a run until a line contains `needle` (waits on events, at most `timeoutMs`). */
async function waitLogLine(base, runId, needle, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/runs/${runId}/logs/stream`, { signal: controller.signal });
    check(res.status === 200 && res.headers.get('content-type')?.startsWith('text/event-stream'), `logs/stream answered ${res.status}`);
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      check(!done, `the log stream closed before "${needle}" appeared`);
      buf += value;
      for (let i; (i = buf.indexOf('\n\n')) >= 0; ) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = frame.split('\n').find((l) => l.startsWith('data: '));
        if (frame.includes('event: log') && data && JSON.parse(data.slice(6)).message.includes(needle)) return;
      }
    }
  } catch (err) {
    if (controller.signal.aborted) throw new SmokeError(`gave up after ${timeoutMs} ms waiting for the line "${needle}" over SSE`);
    throw err;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
  pool.on('error', () => {});
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const logs = [];
  let server = null;
  try {
    const port = await freePort();
    server = await startServer(port, logs);
    const { base, call } = client(port);

    // The normal build has no test-mode route.
    const reset = await call('POST', '/__test/reset');
    check(reset.status === 404 && reset.body?.error?.code === 'NOT_FOUND', `/api/__test/reset on the normal build answered ${reset.status}, expected 404`);

    // 0. Register a repo (a loop must belong to a repo); a fresh temp folder every time, so no path or name clash.
    const repoDir = await mkdtemp(join(tmpdir(), 'lc-smoke-'));
    const repo = await call('POST', '/repos', { path: repoDir, name: `api-smoke ${basename(repoDir)}` });
    check(repo.status === 201, `POST /repos answered ${repo.status} ${JSON.stringify(repo.body)}`);
    check((await one('SELECT path FROM repos WHERE id = $1', [repo.body.id]))?.path === repo.body.path, 'the repo is not in the DB (repos)');
    out('repo ->');

    // 1. Create: Mock runs for 120 "seconds" so the run is still going at Stop; the schedule fires once a year so no tick interferes.
    const name = `api-smoke ${new Date().toISOString()}`;
    const created = await call('POST', '/loops', {
      repoId: repo.body.id,
      name,
      prompt: 'api-smoke: print working... every second',
      cron: '0 0 1 1 *',
      executor: { kind: 'mock', config: { durationSec: 120 } },
    });
    check(created.status === 201 && created.body.status === 'stopped', `POST /loops answered ${created.status} ${JSON.stringify(created.body)}`);
    const loopId = created.body.id;
    check((await one('SELECT status FROM loops WHERE id = $1', [loopId]))?.status === 'stopped', 'the loop is not in the DB (loops)');
    out('created');

    // 2. Start -> execution #1, round #1 runs at once.
    const s1 = await call('POST', `/loops/${loopId}/start`);
    check(s1.status === 200, `start answered ${s1.status} ${JSON.stringify(s1.body)}`);
    const e1 = s1.body.currentExecution;
    const r1 = s1.body.activeRun;
    check(e1?.seq === 1 && r1?.iteration === 1 && r1?.status === 'running', `start: ${JSON.stringify(s1.body)}`);
    const n1 = (await one('SELECT count(*)::int AS n FROM runs WHERE loop_id = $1', [loopId])).n;
    check(n1 === 1, `after Start: the API says round #1 is running but SELECT count(*) FROM runs WHERE loop_id = ... gives ${n1} (expected 1)`);
    const dbR1 = await one('SELECT id, execution_id, status FROM runs WHERE loop_id = $1', [loopId]);
    check(dbR1.id === r1.id && dbR1.execution_id === e1.id && dbR1.status === 'running', `the run in the DB differs from the API: ${JSON.stringify(dbR1)}`);

    // 3. working... over SSE, the session id is in the DB.
    await waitLogLine(base, r1.id, 'working…');
    const sess1 = (await call('GET', `/runs/${r1.id}`)).body.sessionId;
    check(/^mock-/.test(sess1 ?? '') && (await one('SELECT session_id FROM runs WHERE id = $1', [r1.id])).session_id === sess1, 'the session id of run #1 differs from the DB');
    out(` -> start: execution #1, round #1 running (session ${sess1.slice(0, 13)}...) -> working...`);

    // 4. Stop -> run cancelled, execution #1 stopped.
    const stop = await call('POST', `/loops/${loopId}/stop`);
    check(stop.status === 200 && stop.body.status === 'stopped', `stop answered ${stop.status} ${JSON.stringify(stop.body)}`);
    const dbStop = await one(
      `SELECT r.status AS run, e.end_reason AS reason, l.status AS loop FROM runs r JOIN loop_executions e ON e.id = r.execution_id
       JOIN loops l ON l.id = r.loop_id WHERE r.id = $1`,
      [r1.id],
    );
    check(dbStop.run === 'cancelled' && dbStop.reason === 'stopped' && dbStop.loop === 'stopped', `after Stop, DB: ${JSON.stringify(dbStop)}`);
    out(` -> stop: ${dbStop.run}, execution #1 ${dbStop.reason}`);

    // 5. Start again -> execution #2, wait until the run has a session id (the first log line).
    const s2 = await call('POST', `/loops/${loopId}/start`);
    const e2 = s2.body?.currentExecution;
    const r2 = s2.body?.activeRun;
    check(s2.status === 200 && e2?.seq === 2 && r2?.iteration === 2, `start of execution 2: ${s2.status} ${JSON.stringify(s2.body)}`);
    await waitLogLine(base, r2.id, 'Start round #2');
    out(' -> start: execution #2');

    // 6. Kill the process (a crash) and start it again on the same DB.
    const killedAt = Date.now();
    server.child.kill();
    await server.exited;
    server = await startServer(port, logs);
    out(' -> restart');

    const run2 = (await call('GET', `/runs/${r2.id}`)).body;
    const exec2 = (await call('GET', `/executions/${e2.id}`)).body;
    const loop = (await call('GET', `/loops/${loopId}`)).body;
    const db2 = await one(
      `SELECT r.status AS run, e.end_reason AS reason, e.ended_at, l.status AS loop FROM runs r
       JOIN loop_executions e ON e.id = r.execution_id JOIN loops l ON l.id = r.loop_id WHERE r.id = $1`,
      [r2.id],
    );
    check(run2.status === 'interrupted' && db2.run === 'interrupted', `run #2 after the restart: API ${run2.status}, DB ${db2.run}`);
    check(exec2.endReason === 'server_down' && db2.reason === 'server_down', `execution #2 after the restart: API ${exec2.endReason}, DB ${db2.reason}`);
    check(loop.status === 'stopped' && db2.loop === 'stopped' && loop.activeRun === null, `loop after the restart: API ${loop.status}, DB ${db2.loop}`);
    const lagMs = Math.abs(db2.ended_at.getTime() - killedAt);
    check(lagMs <= 11_000, `endedAt is ${lagMs} ms away from the kill time (expected at most 10 seconds of heartbeat)`);
    out(` -> ${run2.status}, execution #2 ${exec2.endReason}, loop ${loop.status}`);

    // 7. Session ids of each execution: API = SELECT; total number of runs: API = SELECT count(*).
    const counts = [];
    for (const e of [e1, e2]) {
      const api = (await call('GET', `/executions/${e.id}`)).body.sessionIds;
      const db = (await pool.query('SELECT session_id FROM runs WHERE execution_id = $1 ORDER BY started_at', [e.id])).rows.map(
        (r) => r.session_id,
      );
      check(JSON.stringify(api) === JSON.stringify(db), `sessionIds of execution #${e.seq}: API ${JSON.stringify(api)} != DB ${JSON.stringify(db)}`);
      counts.push(api.length);
    }
    const runs = (await call('GET', `/loops/${loopId}/runs?limit=100`)).body.items;
    const n = (await one('SELECT count(*)::int AS n FROM runs WHERE loop_id = $1', [loopId])).n;
    check(runs.length === n && n === 2, `number of runs: API ${runs.length}, SELECT count(*) ${n}, expected 2`);
    check(counts[0] === 1 && counts[1] === 1, `sessionIds of execution #1 = ${counts[0]}, #2 = ${counts[1]}, expected 1 and 1`);

    // 8. Shut the second instance down gracefully (IPC; Windows has no SIGINT for a child process) -> exit 0.
    server.child.send({ type: 'shutdown' });
    const code = await Promise.race([server.exited, new Promise((r) => setTimeout(() => r('timeout'), 10_000))]);
    check(code === 0, `graceful shutdown: exit ${code}`);
    server = null;
    out(` -> sessionIds of execution #1 = ${counts[0]}, #2 = ${counts[1]} ok\n`);
  } catch (err) {
    out(`\nFAIL: ${err instanceof SmokeError ? err.message : err.stack}\n--- server log ---\n${logs.join('').slice(-3000)}\n`);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.child.kill();
      await server.exited;
    }
    await pool.end();
  }
}

await main();
