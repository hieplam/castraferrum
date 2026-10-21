// npm run dev: the API (tsx watch, 127.0.0.1:7070) and the Vite UI (127.0.0.1:5180, /api proxied to 7070) run side by side.
//
// Spawns `node <cli>` directly with stdio 'inherit': not through `concurrently` (on Windows `tsx watch` dies silently
// when piped), not through a shell (cmd.exe cannot run paths like node_modules/.bin/...).
// The API starts first; Vite starts once its port is listening, otherwise the first page load reports a bogus
// "cannot connect" error.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = (...path) => join(root, 'node_modules', ...path);
const apiPort = Number(process.env.LOOPS_PORT ?? 7070);

const children = [];
let shuttingDown = false;

function start(name, args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`\n[${name}] stopped (code ${code ?? signal}); closing both processes.`);
    shutdown();
  });
  children.push(child);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) c.kill();
  setTimeout(() => process.exit(0), 300);
}

/** Waits until a process listens on the port (or the time runs out). */
function waitForPort(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((done) => {
    const attempt = () => {
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        done(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) return done(false);
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start('api', [cli('tsx', 'dist', 'cli.mjs'), 'watch', 'server/main.ts']);
if (!(await waitForPort(apiPort))) {
  console.error(`[api] is not listening on port ${apiPort} after 60 seconds; see the error above (is Postgres running?)`);
  shutdown();
} else {
  start('web', [cli('vite', 'bin', 'vite.js')]);
}
