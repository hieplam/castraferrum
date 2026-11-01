// A world for the tests of the gate: a bare repository as origin, the fake `gh`, a clone as the repository of the
// console, and a runner that records each shell line. No test here touches real GitHub or waits on the wall clock.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GhGitHost } from '../../server/adapters/github/gh-git-host';
import { GitGateWorkspace } from '../../server/adapters/git/git-gate-workspace';
import { NodeCommandRunner } from '../../server/adapters/process/node-command-runner';
import type { CommandRequest, CommandResult, CommandRunner } from '../../server/ports/command-runner';
import type { VerifyTask } from '../../shared/domain/scope-guard';
import { createBareRepo, type BareRepo } from './bare-repo';
import { createFakeGh, FAKE_GH_SCRIPT, type FakeGh } from './fake-gh-kit';

export const GITHUB_REPO = 'fake/repo';
export const SETUP_LINE = `node -e "console.log('setup ok')"`;
export const VERIFY_LINE = 'node tests/verify.mjs';
export const TEST_LINE = 'node tests/e.test.mjs';

/** The exam of main: the test of the PR must print `e passed`, and it must go red with no implementation. */
export const EXAM: VerifyTask = { green: [{ run: TEST_LINE, expect: ['e passed'] }], stub: { run: TEST_LINE } };

const TEST_FILE = `import { ok } from '../impl.mjs';\nconsole.log(ok ? 'e passed' : 'e failed');\nprocess.exit(ok ? 0 : 1);\n`;
/** A PR that the exam of main passes. */
export const GOOD_FILES: Record<string, string> = { 'impl.mjs': 'export const ok = true;\n', 'tests/e.test.mjs': TEST_FILE };

const VERIFY_FILE = `import { existsSync } from 'node:fs';
console.log(existsSync('impl.mjs') ? 'verify sees impl.mjs' : 'verify sees no impl.mjs');
console.log('env ' + process.env.LC_GATE_ENV);
process.exit(existsSync('fail-verify.txt') ? 1 : 0);
`;

const PASSING_CHECK = { name: 'checks', status: 'completed', conclusion: 'success' };

export type GateConfigText = { setup: string[]; verify: string[]; env: Record<string, string>; guarded: string[]; testGlobs: string[] };
const GATE: GateConfigText = {
  setup: [SETUP_LINE],
  verify: [VERIFY_LINE],
  env: { LC_GATE_ENV: 'from-main' },
  guarded: ['goals/**', 'scripts/**'],
  testGlobs: ['tests/**'],
};

export type WorldPr = { number: number; headSha: string; branch: string };
type Hook = (req: CommandRequest) => CommandResult | void | Promise<CommandResult | void>;

/** The line of a shell argv, as `goals/gate.json` wrote it, or `null` for a call with no shell (git, gh). */
function shellLine(argv: string[]): string | null {
  if (argv[0] === 'sh') return argv[2] ?? null;
  if (argv[0] === 'cmd.exe') return argv[4]?.slice(1, -1) ?? null;
  return null;
}

class WorldRunner implements CommandRunner {
  readonly lines: string[] = [];
  readonly hooks: { match: string; fn: Hook }[] = [];
  private readonly real = new NodeCommandRunner();
  constructor(private readonly worldFile: string) {}

  async run(req: CommandRequest): Promise<CommandResult> {
    const line = shellLine(req.argv);
    if (line !== null) {
      this.lines.push(line);
      for (const hook of this.hooks) {
        if (!line.includes(hook.match)) continue;
        const replaced = await hook.fn(req);
        if (replaced) return replaced;
      }
    }
    return this.real.run({ ...req, env: { ...req.env, FAKE_GH_WORLD: this.worldFile } });
  }
}

export type GateWorld = {
  bare: BareRepo;
  gh: FakeGh;
  repoPath: string;
  /** The folder of the job worktrees. */
  root: string;
  runner: CommandRunner;
  host: GhGitHost;
  workspace: GitGateWorkspace;
  /** Each wait of the injected `sleep`, in ms. */
  sleeps: number[];
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  /** Called on each `sleep`, so that a test can change the world while the gate waits. */
  onSleep: ((count: number) => void) | null;
  /** Before each shell line that holds `match`, runs `fn`. A result from `fn` replaces the command. */
  onCommand(match: string, fn: Hook): void;
  /** The shell lines that ran, in order. */
  lines(): string[];
  commitMain(files: Record<string, string>): string;
  /** Adds or replaces one task of a verify file on main. */
  setEntry(key: string, task: VerifyTask, file?: string): void;
  /** Changes `goals/gate.json` on main. */
  setGate(over: Partial<GateConfigText>): void;
  openPr(over?: { files?: Record<string, string>; body?: string; base?: string; checks?: Record<string, unknown>[] }): WorldPr;
  commitToPr(pr: WorldPr, files: Record<string, string>): string;
  setChecks(sha: string, checks: Record<string, unknown>[]): void;
  mergeCalls(): string[][];
  statuses(sha: string): { state: string; description: string }[];
  dispose(): void;
};

const gateText = (config: GateConfigText) => `${JSON.stringify({ v: 1, ...config }, null, 2)}\n`;
const verifyText = (tasks: Record<string, VerifyTask>) => `${JSON.stringify({ v: 1, tasks }, null, 2)}\n`;
const FIRST_TASKS = { 141: EXAM };

/** Main with the files of the gate. It is seeded once, and each world copies it, because a test file makes many worlds. */
let seed: BareRepo | null = null;
function seeded(): BareRepo {
  if (seed) return seed;
  seed = createBareRepo();
  const dir = seed.clone();
  seed.commit(
    dir,
    {
      'goals/gate.json': gateText(GATE),
      'goals/verify/e.json': verifyText(FIRST_TASKS),
      'tests/verify.mjs': VERIFY_FILE,
      'package.json': `${JSON.stringify({ scripts: { test: 'node tests/verify.mjs' } }, null, 2)}\n`,
    },
    'seed of the gate',
  );
  seed.push(dir, 'main');
  return seed;
}

/** Deletes the seed. A test file calls it in `afterAll`. */
export function disposeGateSeed(): void {
  seed?.dispose();
  seed = null;
}

export function createGateWorld(): GateWorld {
  const bare = seeded().copy();
  const gh = createFakeGh(bare);
  const dev = bare.clone();
  const repoPath = bare.clone();
  const root = mkdtempSync(join(tmpdir(), 'lc-gate-root-'));
  const runner = new WorldRunner(gh.world);
  const git = (args: string[]) => execFileSync('git', args, { cwd: dev, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const toMain = () => {
    git(['checkout', '-q', 'main']);
    git(['pull', '-q', 'origin', 'main']);
  };
  const commitMain = (files: Record<string, string>) => {
    toMain();
    const sha = bare.commit(dev, files, 'main change');
    bare.push(dev, 'main');
    return sha;
  };

  let gate = GATE;
  const tasks: Record<string, Record<string, VerifyTask>> = { 'e.json': FIRST_TASKS };

  let branches = 0;
  const world: GateWorld = {
    bare,
    gh,
    repoPath,
    root,
    runner,
    host: new GhGitHost({ runner, ghBin: FAKE_GH_SCRIPT }),
    workspace: new GitGateWorkspace({ runner, root }),
    sleeps: [],
    onSleep: null,
    async sleep(ms) {
      world.sleeps.push(ms);
      world.onSleep?.(world.sleeps.length);
    },
    onCommand: (match, fn) => void runner.hooks.push({ match, fn }),
    lines: () => [...runner.lines],
    commitMain,
    setEntry(key, task, file = 'e.json') {
      tasks[file] = { ...tasks[file], [key]: task };
      commitMain({ [`goals/verify/${file}`]: verifyText(tasks[file]!) });
    },
    setGate(over) {
      gate = { ...gate, ...over };
      commitMain({ 'goals/gate.json': gateText(gate) });
    },
    openPr(over = {}) {
      toMain();
      const branch = `pr-${++branches}`;
      bare.branch(dev, branch);
      const headSha = bare.commit(dev, over.files ?? GOOD_FILES, 'pull request change');
      bare.push(dev, branch);
      const w = gh.read();
      const number = Math.max(0, ...w.prs.map((p) => p.number), ...w.issues.map((i) => i.number)) + 1;
      w.prs.push({
        number,
        title: `Change ${number}`,
        body: over.body ?? '',
        state: 'OPEN',
        headRefName: branch,
        baseRefName: over.base ?? 'main',
        headRefOid: headSha,
        mergeCommit: null,
        closingIssuesReferences: [],
        url: `https://github.com/fake/repo/pull/${number}`,
        createdAt: new Date(0).toISOString(),
        mergedAt: null,
      });
      w.checkRuns[headSha] = over.checks ?? [PASSING_CHECK];
      writeFileSync(gh.world, JSON.stringify(w, null, 2));
      return { number, headSha, branch };
    },
    commitToPr(pr, files) {
      git(['checkout', '-q', pr.branch]);
      const sha = bare.commit(dev, files, 'a later push');
      bare.push(dev, pr.branch);
      const w = gh.read();
      w.prs.find((p) => p.number === pr.number)!.headRefOid = sha;
      writeFileSync(gh.world, JSON.stringify(w, null, 2));
      return sha;
    },
    setChecks(sha, checks) {
      const w = gh.read();
      w.checkRuns[sha] = checks;
      writeFileSync(gh.world, JSON.stringify(w, null, 2));
    },
    mergeCalls: () => gh.read().calls.map((c) => c.args).filter((args) => args[0] === 'pr' && args[1] === 'merge'),
    statuses: (sha) => (gh.read().statuses[sha] ?? []).map((s) => ({ state: s.state, description: s.description })),
    dispose() {
      gh.dispose();
      bare.dispose();
      rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    },
  };
  return world;
}
