import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type {
  FolderService,
  HealthService,
  HoldService,
  LiveService,
  LoopService,
  NoticeService,
  ProcessService,
  ScoreboardService,
  GateService, GoalCardService, GoalViewService, ProbeService,
  RepoService,
  RunService,
  TranscriptService,
} from '../services/contracts';
import { HttpError, sendError } from './errors';
import { folderRoutes } from './folder-routes';
import { gateRoutes } from './gate-routes';
import { goalCardRoutes } from './goal-card-routes';
import { goalRoutes } from './goal-routes';
import { healthRoutes } from './health-routes';
import { holdRoutes } from './hold-routes';
import { liveRoutes } from './live-routes';
import { loopRoutes } from './loop-routes';
import { noticeRoutes } from './notice-routes';
import { processRoutes } from './process-routes';
import { scoreboardRoutes } from './scoreboard-routes';
import { probeRoutes } from './probe-routes';
import { repoRoutes } from './repo-routes';
import { scheduleRoutes } from './schedule-routes';
import { testRoutes, type TestHooks } from './test-routes';
import { transcriptRoutes } from './transcript-routes';

export type { TestHooks } from './test-routes';

/** Services the API calls (interfaces only — the entry layer does not know the implementation). */
export type ApiServices = {
  loops: LoopService;
  repos: RepoService;
  /** The "Browse…" box on the Repo page. */
  folders: FolderService;
  runs: RunService;
  live: LiveService;
  /** Transcript of a run. */
  transcripts: TranscriptService;
  /** The unread notices (spec 2.6). */
  notices: NoticeService;
  /** The run events of a period, for the process review. */
  processEvents: ProcessService;
  /** The process scoreboard (spec 2.12). */
  scoreboard: ScoreboardService;
  /** Current server time (test mode: a clock that can fast-forward) — for `GET /schedule/preview`. */
  now: () => Date;
  /** Probe settings of a loop (goal-driven loop). */
  probes: ProbeService;
  gate: GateService;
  goalCards: GoalCardService;
  /** The goals page of a loop (goal G11). */
  goalView: GoalViewService;
  /** The open holds (spec 2.5). */
  holds: HoldService;
};

export type HttpDeps = {
  health: HealthService;
  /** Omitted = only `/api/health` exists (health test). */
  api?: ApiServices;
  /** Only the composition root passes it, and only when `LOOPS_TEST_MODE=1` → only then does `/api/__test/*` exist. */
  testHooks?: TestHooks;
  /** Folder of the UI build (dist/web); omitted = API only (tests). */
  webRoot?: string;
  logger?: boolean;
  /** SSE `:ping` heartbeat. Defaults to 15 seconds (tests shorten it). */
  sseHeartbeatMs?: number;
};

/** Builds the Fastify app; does not listen yet — tests call `app.inject()`, the composition root calls `listen()`. */
export async function buildHttpApp(deps: HttpDeps) {
  // forceCloseConnections: on shutdown, drop every socket right after the SSE streams are aborted. Without it,
  // app.close() waited about 4000 ms (measured) for a leftover keep-alive socket that was not idle, so shutdown
  // took longer than the 2000 ms budget the transcript API test enforces.
  const app = Fastify({ logger: deps.logger ?? false, forceCloseConnections: true }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler((err, req, reply) => sendError(err, req, reply, (e) => req.log.error(e)));

  // SSE streams never end on their own: on shutdown abort them all first, otherwise `close()` waits forever.
  const shutdown = new AbortController();
  app.addHook('preClose', async () => shutdown.abort());

  await app.register(healthRoutes, { health: deps.health });
  if (deps.api) {
    const { loops, repos, folders, runs, live, transcripts, now, probes, notices, processEvents, scoreboard, gate, goalCards, goalView, holds } = deps.api;
    const sse = { heartbeatMs: deps.sseHeartbeatMs ?? 15_000, shutdown: shutdown.signal };
    await app.register(loopRoutes, { loops, runs });
    await app.register(probeRoutes, { probes });
    await app.register(gateRoutes, { gate });
    await app.register(goalCardRoutes, { goalCards });
    await app.register(goalRoutes, { goalView });
    await app.register(holdRoutes, { holds });
    await app.register(repoRoutes, { repos });
    await app.register(folderRoutes, { folders });
    await app.register(scheduleRoutes, { loops, now });
    await app.register(liveRoutes, { live, runs, sse });
    await app.register(transcriptRoutes, { transcripts, runs, sse });
    await app.register(noticeRoutes, { notices });
    await app.register(processRoutes, { processEvents });
    await app.register(scoreboardRoutes, { scoreboard });
  }
  if (deps.testHooks) await app.register(testRoutes, { hooks: deps.testHooks });

  const webRoot = deps.webRoot !== undefined && existsSync(join(deps.webRoot, 'index.html')) ? deps.webRoot : undefined;
  if (webRoot) await app.register(fastifyStatic, { root: webRoot });

  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/')) {
      return sendError(new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${req.url}`), req, reply);
    }
    if (!webRoot) {
      return reply.code(503).type('text/plain; charset=utf-8').send('The UI build is missing — run: npm run build');
    }
    // UI paths (/loops/…) are handled by the router in the browser.
    return reply.sendFile('index.html');
  });

  return app;
}

export type HttpApp = Awaited<ReturnType<typeof buildHttpApp>>;
