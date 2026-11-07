// Entry point of the server process: read the config, wire everything (compose.ts — the composition root), listen on the port, shut down gracefully.
// Startup order (ARCHITECTURE.md § Composition root): open DB + migration → single-server lock → recovery → ticker → HTTP.
import { composeServer, type ComposedServer } from './compose';
import { loadConfig, loadDotEnv, redactUrl } from './config';

loadDotEnv();
const cfg = loadConfig();
const log = (msg: string) => console.log(msg);

const server: ComposedServer = await composeServer({
  databaseUrl: cfg.databaseUrl,
  testMode: cfg.testMode,
  mockExecutor: cfg.mockExecutor,
  webRoot: cfg.webRoot,
  transcriptPage: cfg.transcriptPage,
  notifyWebhook: cfg.notifyWebhook,
  ghBin: cfg.ghBin,
  epicScript: cfg.epicScript,
  log,
}).catch((err: Error) => {
  console.error(`Could not start (DB ${redactUrl(cfg.databaseUrl)}): ${err.message}`);
  if (err.name !== 'InstanceLockTakenError') {
    console.error('Is Postgres running? docker compose -f compose.yml up -d (in the repository root)');
  }
  process.exit(1);
});

const r = server.recovery;
log(
  `Restart recovery: ${r.interruptedRuns} unfinished runs → interrupted, ${r.closedExecutions} executions closed as server_down, ` +
    `${r.stoppedLoops} loops → stopped (last heartbeat: ${r.lastHeartbeatAt?.toISOString() ?? 'none'})`,
);

server.startTicker();
try {
  await server.app.listen({ host: '127.0.0.1', port: cfg.port });
} catch (err) {
  console.error(`Cannot listen on port ${cfg.port}: ${(err as Error).message}`);
  await server.shutdown();
  process.exit(1);
}
log(`Castraferrum: http://127.0.0.1:${cfg.port}  (DB ${redactUrl(cfg.databaseUrl)}${cfg.testMode ? ', test mode' : ''})`);

let closing = false;
async function shutdown(reason: string): Promise<void> {
  if (closing) return;
  closing = true;
  log(`Received ${reason}, shutting down…`);
  const t = Date.now();
  await server.shutdown();
  log(`Shut down cleanly after ${Date.now() - t} ms.`);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
// Windows has no real signal for a child process (kill = TerminateProcess): the parent process (script, test) opens an IPC channel
// and sends { type: 'shutdown' } to shut down gracefully.
process.on('message', (msg) => {
  if ((msg as { type?: unknown } | null)?.type === 'shutdown') void shutdown('shutdown command via IPC');
});
