// Composition root (ARCHITECTURE.md § Composition root): the ONLY place that connects interfaces to implementations. main.ts calls
// this function and then handles the process side (reading .env, listening on the port, shutdown signals); the API tests (tests/api) call this very function, so the tests
// run on the real server's exact wiring — there is no second wiring.
import { InMemoryActiveRuns } from './adapters/active-runs/in-memory-active-runs';
import { OffsetClock } from './adapters/clock/offset-clock';
import { SystemClock } from './adapters/clock/system-clock';
import { InProcessEventBus } from './adapters/events/in-process-event-bus';
import { ClaudeAgentExecutor } from './adapters/executors/claude/claude-agent-executor';
import { testModeQuery } from './adapters/executors/claude/test-mode-query';
import { MockExecutor } from './adapters/executors/mock/mock-executor';
import { StaticExecutorRegistry } from './adapters/executors/static-executor-registry';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NodeDirectoryProbe } from './adapters/fs/node-directory-probe';
import { NodeFolderBrowser } from './adapters/fs/node-folder-browser';
import { OverridableFolderBrowser } from './adapters/fs/overridable-folder-browser';
import { OverridableDirectoryProbe } from './adapters/fs/overridable-directory-probe';
import { RandomIdGenerator } from './adapters/ids/random-id-generator';
import { openDb, truncateAll, type Db } from './adapters/postgres/db';
import { PgDbProbe } from './adapters/postgres/db-probe';
import { acquireInstanceLock, type InstanceLock } from './adapters/postgres/instance-lock';
import { createPgRepositories } from './adapters/postgres/repositories';
import { ClaudeJsonlTranscriptSource } from './adapters/transcripts/claude-jsonl/claude-jsonl-transcript-source';
import { buildHttpApp, type HttpApp, type TestHooks } from './http/app';
import { startTicker, type Ticker } from './scheduler/ticker';
import type { RecoveryReport } from './services/contracts';
import { DefaultFolderService } from './services/folder-service';
import { DefaultHealthService } from './services/health-service';
import { DefaultLiveService } from './services/live-service';
import { DefaultLoopService } from './services/loop-service';
import { DefaultProbeService } from './services/probe-service';
import { DefaultRecoveryService } from './services/recovery-service';
import { DefaultRepoService } from './services/repo-service';
import { DefaultRunService } from './services/run-service';
import { DefaultSchedulingService } from './services/scheduling-service';
import { DefaultTranscriptService } from './services/transcript-service';

export type ComposeOptions = {
  databaseUrl: string;
  /**
   * `LOOPS_TEST_MODE=1`: a clock that can fast-forward + the `/api/__test/*` routes + forcing folders present / missing + a fake folder world for the
   * "Browse…" box; the real Claude only opens in folders
   * named `lc-real-claude-*` (test-mode-query.ts).
   */
  testMode: boolean;
  /**
   * Registers the Mock executor (default = `testMode`). The real console has only Claude (project owner: "remove mock entirely"); Mock
   * is now only for tests (contract, API tests, e2e, api-smoke).
   */
  mockExecutor?: boolean;
  webRoot?: string;
  log?: (msg: string) => void;
  /** Defaults to 1 000 ms. API tests shorten it. */
  tickEveryMs?: number;
  /** Length of one "second" of the Mock executor. Defaults to 1 000 ms; only tests shorten it. */
  mockTickMs?: number;
  /** SSE `:ping` heartbeat. Defaults to 15 000 ms. */
  sseHeartbeatMs?: number;
  /** How long to wait for Postgres when opening the DB. Defaults to 30 000 ms. */
  dbWaitMs?: number;
  /**
   * The `projects/` folders searched for transcript files. Defaults to `${CLAUDE_CONFIG_DIR ?? ~/.claude}/projects` — the exact env
   * the Claude executor passes to its child process, so the console and Claude always share one folder. API tests pass a temporary root.
   */
  transcriptRoots?: string[];
  /** Transcript page size (default 50 entries / 4 MB). Test mode: `LOOPS_TRANSCRIPT_PAGE=<n>` forces `minEntries` (e2e). */
  transcriptPage?: { minEntries: number; maxBytes: number };
};

export type ComposedServer = {
  app: HttpApp;
  /** Result of the recovery at startup (runs BEFORE the ticker and HTTP open). */
  recovery: RecoveryReport;
  /** Starts the 1-second ticker (main.ts calls it right before `listen`). */
  startTicker(): void;
  /**
   * Graceful shutdown: stop the ticker → close HTTP (abort SSE streams) → abort the signals of running runs WITHOUT recording a result, wait for them
   * to exit → write the last heartbeat (= the execution's `endedAt` after restart) → release the lock → close the DB. Unfinished runs stay `running`
   * and the next startup marks them `interrupted` + closes the execution `server_down` — as if the server died, except at the right shutdown time.
   */
  shutdown(): Promise<void>;
  /**
   * Observation for tests: listeners on the bus (a closed SSE must unregister), runs executing in the process, ticks run so far,
   * number of open transcript streams.
   */
  inspect: { listeners(): number; activeRuns(): number; ticks(): number; transcriptFollowers(): number };
};

export async function composeServer(opts: ComposeOptions): Promise<ComposedServer> {
  const db: Db = await openDb(opts.databaseUrl, { log: opts.log, waitMs: opts.dbWaitMs }); // + apply migrations
  let lock: InstanceLock;
  try {
    lock = await acquireInstanceLock(db.pool); // one DB — one server (the second server's recovery would wreck the first server)
  } catch (err) {
    await db.close();
    throw err;
  }

  const testClock = opts.testMode ? new OffsetClock() : null;
  const clock = testClock ?? new SystemClock();
  const bus = new InProcessEventBus(); // both EventPublisher and EventSource
  const repos = createPgRepositories(db.pool);
  // Order = order of the form's executor choice buttons (Claude first — the approved preview).
  const executors = new StaticExecutorRegistry([
    // phase 2: each run is one Claude Code session, using the machine's login (subscription plan)
    new ClaudeAgentExecutor(opts.testMode ? { query: testModeQuery() } : {}),
    ...((opts.mockExecutor ?? opts.testMode) ? [new MockExecutor({ random: Math.random, tickMs: opts.mockTickMs })] : []),
  ]);
  const ids = new RandomIdGenerator();
  const active = new InMemoryActiveRuns();
  const runService = new DefaultRunService({ ...repos, executors, active, clock, ids, events: bus });
  const loopService = new DefaultLoopService({ ...repos, runService, executors, clock, ids, events: bus });
  const probeService = new DefaultProbeService({ loops: repos.loops, probes: repos.probes });
  const testDirs = opts.testMode ? new OverridableDirectoryProbe(new NodeDirectoryProbe()) : null;
  const repoService = new DefaultRepoService({ repos: repos.repos, directories: testDirs ?? new NodeDirectoryProbe(), clock, ids });
  const testFolders = opts.testMode ? new OverridableFolderBrowser(new NodeFolderBrowser()) : null;
  const folderService = new DefaultFolderService({ repos: repos.repos, folders: testFolders ?? new NodeFolderBrowser() });
  const scheduling = new DefaultSchedulingService({ loops: repos.loops, heartbeat: repos.heartbeat, runService, clock });
  const live = new DefaultLiveService({ source: bus, runs: repos.runs, logs: repos.logs });
  const transcripts = new DefaultTranscriptService({
    runs: repos.runs,
    events: bus,
    source: new ClaudeJsonlTranscriptSource({
      roots: opts.transcriptRoots ?? [join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects')],
    }),
    page: opts.transcriptPage,
  });

  let recovery: RecoveryReport;
  try {
    recovery = await new DefaultRecoveryService({ ...repos, clock }).recover();
  } catch (err) {
    await lock.release();
    await db.close();
    throw err;
  }

  let ticker: Ticker | null = null;
  let ticks = 0;
  const tick = () => {
    ticker = startTicker(scheduling, {
      everyMs: opts.tickEveryMs ?? 1000,
      onTick: (r) => {
        if (r.ran) ticks++;
      },
      onError: (err) => opts.log?.(`Schedule tick failed (retried every tick): ${err instanceof Error ? err.message : String(err)}`),
    });
  };
  /** Stops every run executing in the process (without recording a result) and waits for them to exit. */
  const drainRuns = async () => {
    active.abortAll();
    await runService.settled();
  };

  const testHooks: TestHooks | undefined = testClock && testDirs && testFolders
    ? {
        clock: testClock,
        directories: testDirs,
        folders: testFolders,
        async reset() {
          const wasTicking = ticker !== null;
          await ticker?.stop();
          ticker = null;
          await drainRuns();
          await truncateAll(db.pool);
          testClock.reset();
          testDirs.clear();
          testFolders.clear();
          if (wasTicking) tick();
        },
      }
    : undefined;

  const app = await buildHttpApp({
    health: new DefaultHealthService({ db: new PgDbProbe(db.pool) }),
    api: {
      loops: loopService,
      repos: repoService,
      folders: folderService,
      runs: runService,
      live,
      transcripts,
      probes: probeService,
      now: () => clock.now(),
    },
    testHooks,
    webRoot: opts.webRoot,
    sseHeartbeatMs: opts.sseHeartbeatMs,
  });

  let closing: Promise<void> | null = null;
  return {
    app,
    recovery,
    startTicker() {
      if (!ticker) tick();
    },
    shutdown() {
      closing ??= (async () => {
        await ticker?.stop();
        ticker = null;
        await app.close();
        await drainRuns();
        await repos.heartbeat.beat(clock.now()).catch(() => {}); // if the DB is already down, fall back to the latest heartbeat (up to 10 seconds old)
        await lock.release();
        await db.close();
      })();
      return closing;
    },
    inspect: {
      listeners: () => bus.listenerCount(),
      activeRuns: () => active.size(),
      ticks: () => ticks,
      transcriptFollowers: () => transcripts.followers(),
    },
  };
}
