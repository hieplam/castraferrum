// Entry point of the server process: read the config, wire everything (compose.ts — the composition root), listen on the port, shut down gracefully.
// Startup order (ARCHITECTURE.md § Composition root): open DB + migration → single-server lock → recovery → ticker → HTTP.
import { networkInterfaces } from 'node:os';
import { composeServer, type ComposedServer } from './compose';
import { loadConfig, loadDotEnv, networkLines, redactUrl, signInLines, UsageError, USAGE } from './config';

loadDotEnv();
let cfg: ReturnType<typeof loadConfig>;
try {
  cfg = loadConfig(process.env, process.argv.slice(2));
} catch (err) {
  if (!(err instanceof UsageError)) throw err;
  console.error(`${err.message}

${err.usage}`);
  process.exit(2);
}
if (cfg.help) {
  console.log(USAGE);
  process.exit(0);
}
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
  ...(cfg.auth ? { auth: cfg.auth } : {}),
  ...(cfg.tunnel ? { tunnel: cfg.tunnel } : {}),
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
  await server.app.listen({ host: cfg.host, port: cfg.port });
} catch (err) {
  console.error(`Cannot listen on ${cfg.host}:${cfg.port}: ${(err as Error).message}`);
  await server.shutdown();
  process.exit(1);
}
log(`Castraferrum: http://127.0.0.1:${cfg.port}  (DB ${redactUrl(cfg.databaseUrl)}${cfg.testMode ? ', test mode' : ''})`);
for (const line of networkLines(cfg.host, cfg.port, networkInterfaces())) log(line);
for (const line of signInLines(cfg.host, cfg.auth)) log(line);
if (cfg.publicUrl) log(`Open: ${cfg.publicUrl}`);
if (cfg.tunnel) {
  // Spec D9: a program that cannot start (ENOENT) stops startup with exit code 1 and the install command.
  try {
    await server.startTunnel();
  } catch (err) {
    console.error(`Cannot start the tunnel: ${(err as Error).message}`);
    await server.shutdown();
    process.exit(1);
  }
}

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
