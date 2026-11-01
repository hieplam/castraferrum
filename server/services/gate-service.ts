// The merge gate (spec 2.8, 2.9, decisions 31 to 38): the only actor that merges. It has no model. It takes one job at a
// time, runs the steps in order, and stops at the first failure. The exam comes from the `main` commit of the job, never
// from the PR. A step fails closed: anything that is not a proven pass is a failure.
import { DomainError } from '../../shared/domain/errors';
import type { GateFinalState, GateJob, GateStepName, GateStepStatus, RepoGate } from '../../shared/domain/gate';
import { isRealRed, stubCommandProblem } from '../../shared/domain/gate-commands';
import { checkScope, normalizePath, parseGateConfig, parseVerifyFile, type ChangedFile, type GateConfig, type VerifyChange, type VerifyTask } from '../../shared/domain/scope-guard';
import type { Clock } from '../ports/clock';
import type { CommandResult, CommandRunner } from '../ports/command-runner';
import type { GateRepository } from '../ports/gate-repository';
import type { GateTree, GateWorkspace } from '../ports/gate-workspace';
import type { GitHost } from '../ports/git-host';
import type { IdGenerator } from '../ports/ids';
import type { RepoRecord, RepoRepository } from '../ports/repo-repository';
import type { GateQueueInput, GateQueueResult, GateService, GateTickReport } from './contracts';

const MINUTE = 60_000;
const SETUP_MS = 20 * MINUTE;
const GREEN_MS = 20 * MINUTE;
const STUB_MS = 15 * MINUTE;
const VERIFY_MS = 60 * MINUTE;
const CHECK_COMMAND_MS = 5 * MINUTE;
const CI_WAIT_MS = 30_000;
const CI_READS = 60;
/** Decision 38. Any other conclusion fails `ci`. */
const PASSING_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);
const OUTPUT_LINES = 60;
const LIVE_JOBS_READ = 100;
const VERIFY_DIR = 'goals/verify';
const GATE_FILE = 'goals/gate.json';

/** The last 60 lines of a text. */
export function outputTail(text: string): string {
  return text.trimEnd().split(/\r?\n/).slice(-OUTPUT_LINES).join('\n');
}

export type GateServiceDeps = {
  gate: GateRepository;
  repos: Pick<RepoRepository, 'findById'>;
  host: GitHost;
  workspace: GateWorkspace;
  commands: CommandRunner;
  clock: Clock;
  ids: IdGenerator;
  /** Rejects when `signal` aborts. Tests inject one that never waits. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
};

/** `stop()` ended the job. The job stays `running`, and the next start queues it again (decision 37). */
class GateStopped extends Error {}

/** A step ended the job. */
class JobEnded extends Error {
  constructor(
    readonly step: GateStepName,
    readonly line: string,
    readonly state: GateFinalState,
  ) {
    super(line);
  }
}

type StepEnd = {
  status: GateStepStatus;
  exitCode?: number | null;
  output: string;
  /** The one line of the commit status when the step fails. */
  line?: string;
  /** The job state when the step fails. Default `failed`. */
  state?: GateFinalState;
};

/** What one job knows. The fields below `setting` are set by the steps of one attempt. */
type JobRun = {
  job: GateJob;
  repoPath: string;
  setting: RepoGate;
  signal: AbortSignal;
  errors: { loopId: string; message: string }[];
  seq: number;
  /** The step that runs now, for an error outside a step. */
  current: GateStepName;
};

type Attempt = {
  mainSha: string;
  config: GateConfig;
  files: ChangedFile[];
  /** Set when the verdict of `scope` is a plan PR: `green` and `stub` skip with this reason. */
  planReason: string | null;
  tree: GateTree | null;
  task: VerifyTask | null;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const firstLine = (text: string) => text.split(/\r?\n/).find((line) => line.trim() !== '') ?? text;
const combined = (result: CommandResult) => [result.stdout, result.stderr, result.error].filter(Boolean).join('\n');
const fail = (line: string, output = line, exitCode: number | null = null): StepEnd => ({ status: 'fail', exitCode, output, line });

function whyNotPassed(result: CommandResult): string {
  if (result.timedOut) return 'timed out';
  if (result.error !== null) return result.error;
  return `exit ${result.exitCode}`;
}

export class DefaultGateService implements GateService {
  private stopped = false;
  private control: AbortController | null = null;
  private current: Promise<void> | null = null;

  constructor(private readonly deps: GateServiceDeps) {}

  async queue(input: GateQueueInput): Promise<GateQueueResult> {
    const { gate, repos, host, ids, clock } = this.deps;
    if (!(await repos.findById(input.repoId))) throw new DomainError('REPO_NOT_FOUND', `No repo ${input.repoId}`);
    const setting = await gate.getRepoGate(input.repoId);
    if (!setting?.enabled) throw new DomainError('GATE_OFF', `The gate of repo ${input.repoId} is off`);
    const pr = await host.pullRequest(setting.githubRepo, input.prNumber);
    // Decision 33. A PR that closes no issue has an empty key, so it can only pass as a plan PR.
    const taskKey = input.taskKey ?? String(pr.closingIssues[0] ?? '');
    const id = ids.newId();
    const outcome = await gate.enqueue({ id, repoId: input.repoId, prNumber: input.prNumber, headSha: pr.headSha, taskKey, at: clock.now() });
    if (outcome === 'queued') return { outcome, jobId: id, headSha: pr.headSha, taskKey };
    const live = (await gate.list(LIVE_JOBS_READ)).find(
      (job) => job.repoId === input.repoId && job.prNumber === input.prNumber && job.headSha === pr.headSha && (job.state === 'queued' || job.state === 'running'),
    );
    return { outcome, jobId: live?.id ?? null, headSha: pr.headSha, taskKey: live?.taskKey ?? taskKey };
  }

  async tick(): Promise<GateTickReport> {
    if (this.stopped) return { jobId: null, errors: [] };
    const job = await this.deps.gate.takeNext(this.deps.clock.now());
    if (!job) return { jobId: null, errors: [] };
    const errors: GateTickReport['errors'] = [];
    const control = new AbortController();
    this.control = control;
    if (this.stopped) control.abort();
    const running = this.runJob(job, control.signal, errors);
    this.current = running;
    try {
      await running;
    } finally {
      this.current = null;
      this.control = null;
    }
    return { jobId: job.id, errors };
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.control?.abort();
    await this.current?.catch(() => {});
  }

  resume(): void {
    this.stopped = false;
  }

  private async runJob(job: GateJob, signal: AbortSignal, errors: GateTickReport['errors']): Promise<void> {
    const { gate, repos } = this.deps;
    const repo = await repos.findById(job.repoId);
    const setting = await gate.getRepoGate(job.repoId);
    const steps = await gate.listSteps(job.id);
    const seq = Math.max(0, ...steps.map((step) => step.seq)) + 1;
    if (!repo || !setting?.enabled) {
      await gate.appendStep({ jobId: job.id, seq, step: 'scope', status: 'fail', exitCode: null, ms: 0, outputTail: 'GATE_OFF: the gate of the repository is off' });
      await gate.finish(job.id, { state: 'failed', failedStep: 'scope', at: this.deps.clock.now() });
      return;
    }
    const run: JobRun = { job, repoPath: repo.path, setting, signal, errors, seq, current: 'scope' };
    try {
      await this.attempts(run, repo);
    } catch (e) {
      if (e instanceof GateStopped) return;
      await this.endFailed(run, e);
    }
  }

  private async attempts(run: JobRun, repo: RepoRecord): Promise<void> {
    await this.deps.host.setStatus(run.setting.githubRepo, run.job.headSha, { state: 'pending', description: 'gate: running' });
    if (await this.attempt(run, repo, 1)) await this.attempt(run, repo, 2);
    await this.deps.gate.finish(run.job.id, { state: 'merged', failedStep: null, at: this.deps.clock.now() });
  }

  private async endFailed(run: JobRun, e: unknown): Promise<void> {
    const { gate, host, clock } = this.deps;
    const ended = e instanceof JobEnded ? e : new JobEnded(run.current, message(e), 'failed');
    if (!(e instanceof JobEnded)) run.errors.push({ loopId: run.job.id, message: message(e) });
    await gate.finish(run.job.id, { state: ended.state, failedStep: ended.step, at: clock.now() });
    try {
      await host.setStatus(run.setting.githubRepo, run.job.headSha, { state: 'failure', description: `${ended.step}: ${ended.line}` });
    } catch (statusError) {
      run.errors.push({ loopId: run.job.id, message: message(statusError) });
    }
  }

  /** Runs `body` and writes one row. Any throw is a failed step, so a broken call can never pass. */
  private async step(run: JobRun, name: GateStepName, body: () => Promise<StepEnd>): Promise<void> {
    const { gate, clock } = this.deps;
    const started = clock.now().getTime();
    run.current = name;
    if (run.signal.aborted) throw new GateStopped();
    let end: StepEnd;
    try {
      end = await body();
    } catch (e) {
      if (e instanceof GateStopped || run.signal.aborted) throw new GateStopped();
      const exitCode = typeof (e as { exitCode?: unknown }).exitCode === 'number' ? (e as { exitCode: number }).exitCode : null;
      const stderr = (e as { stderr?: unknown }).stderr;
      end = fail(firstLine(message(e)), [message(e), typeof stderr === 'string' ? stderr : ''].filter(Boolean).join('\n'), exitCode);
    }
    if (run.signal.aborted) throw new GateStopped();
    await gate.appendStep({
      jobId: run.job.id,
      seq: run.seq++,
      step: name,
      status: end.status,
      exitCode: end.exitCode ?? null,
      ms: Math.max(0, clock.now().getTime() - started),
      outputTail: outputTail(end.output),
    });
    if (end.status === 'fail') throw new JobEnded(name, end.line ?? name, end.state ?? 'failed');
  }

  /** One pass from `scope` to `merge`. Gives true when `main` moved and the job must run again (decision 36). */
  private async attempt(run: JobRun, repo: RepoRecord, attempt: number): Promise<boolean> {
    const state: Attempt = { mainSha: '', config: undefined as never, files: [], planReason: null, tree: null, task: null };
    let again = false;
    try {
      await this.step(run, 'scope', () => this.scope(run, state));
      await this.step(run, 'base', () => this.base(run, state));
      await this.step(run, 'setup', () => this.lines(run, state, state.config.setup, SETUP_MS));
      await this.step(run, 'green', () => this.green(run, state));
      await this.step(run, 'stub', () => this.stub(run, state));
      await this.step(run, 'verify', () => this.lines(run, state, state.config.verify, VERIFY_MS));
      await this.step(run, 'ci', () => this.ci(run));
      await this.step(run, 'merge', async () => {
        const merged = await this.merge(run, repo, state, attempt);
        again = merged.again;
        return merged.end;
      });
    } finally {
      if (state.tree) {
        try {
          await this.deps.workspace.remove(run.repoPath, run.job.id);
        } catch (e) {
          run.errors.push({ loopId: run.job.id, message: message(e) });
        }
      }
    }
    return again;
  }

  private async scope(run: JobRun, state: Attempt): Promise<StepEnd> {
    const { host, workspace } = this.deps;
    const { job, repoPath, setting } = run;
    const pr = await host.pullRequest(setting.githubRepo, job.prNumber);
    if (pr.state !== 'OPEN') return fail(`the PR is ${pr.state}`);
    if (pr.baseRef !== 'main') return fail(`the PR targets ${pr.baseRef}, not main`);
    if (pr.headSha !== job.headSha) return fail('the head of the PR moved after the job was queued');
    const fetched = await workspace.fetch(repoPath, { headRef: pr.headRef, headSha: job.headSha });
    if (!fetched.headMatches) return fail('the head of the branch moved after the job was queued');
    state.mainSha = fetched.mainSha;
    const gateText = await workspace.readAt(repoPath, fetched.mainSha, GATE_FILE);
    if (gateText === null) return fail(`${GATE_FILE} is not on main`);
    state.config = parseGateConfig(gateText);

    const { mergeBase, files } = await workspace.changed(repoPath, fetched.mainSha, job.headSha);
    state.files = files;
    const verifyChanges: VerifyChange[] = [];
    for (const file of files) {
      if (!normalizePath(file.path).norm.startsWith(`${VERIFY_DIR}/`)) continue;
      verifyChanges.push({ path: file.path, base: await workspace.readAt(repoPath, mergeBase, file.path), head: await workspace.readAt(repoPath, job.headSha, file.path) });
    }
    const baseText = await workspace.readAt(repoPath, mergeBase, 'package.json');
    const headText = await workspace.readAt(repoPath, job.headSha, 'package.json');
    const verdict = checkScope({
      changed: files,
      guarded: state.config.guarded,
      verifyChanges,
      ...(baseText !== null && headText !== null ? { packageChange: { base: baseText, head: headText } } : {}),
    });
    if (verdict.verdict === 'guarded') {
      const output = `${verdict.reason}\n${verdict.paths.join('\n')}`;
      if (job.ratifiedAt === null) return { ...fail(verdict.reason, output), state: 'needs_ratification' };
      return { status: 'skip', output: `ratified: ${output}` };
    }
    if (verdict.verdict === 'plan') state.planReason = `plan PR, added keys: ${verdict.addedKeys.join(', ')}`;
    return { status: 'pass', exitCode: 0, output: `${files.length} changed files, verdict ${verdict.verdict}` };
  }

  private async base(run: JobRun, state: Attempt): Promise<StepEnd> {
    const prepared = await this.deps.workspace.prepare(run.repoPath, run.job.id, state.mainSha, run.job.headSha);
    if (!prepared.ok) return fail('the PR does not rebase on main', prepared.output);
    state.tree = prepared.tree;
    return { status: 'pass', exitCode: 0, output: `rebased on ${state.mainSha}: ${prepared.tree.rebasedSha}` };
  }

  private async exec(run: JobRun, state: Attempt, line: string, timeoutMs: number): Promise<CommandResult> {
    const result = await this.deps.workspace.run(state.tree!, { line, env: state.config.env, timeoutMs, signal: run.signal });
    if (run.signal.aborted) throw new GateStopped();
    return result;
  }

  /** Lines of `goals/gate.json`, all on main. Each must exit 0. */
  private async lines(run: JobRun, state: Attempt, lines: string[], timeoutMs: number): Promise<StepEnd> {
    let output = '';
    for (const line of lines) {
      const result = await this.exec(run, state, line, timeoutMs);
      output += `${combined(result)}\n`;
      if (result.exitCode !== 0) return fail(`${whyNotPassed(result)}: ${line}`, `${output}${whyNotPassed(result)}: ${line}`, result.exitCode);
    }
    return { status: 'pass', exitCode: 0, output };
  }

  /** Decision 33. Reads every verify file of the `main` commit of the job, and nothing of the PR. */
  private async examOf(run: JobRun, mainSha: string): Promise<VerifyTask | string> {
    const { workspace } = this.deps;
    const key = run.job.taskKey;
    const hits: VerifyTask[] = [];
    for (const name of await workspace.listAt(run.repoPath, mainSha, VERIFY_DIR)) {
      const text = await workspace.readAt(run.repoPath, mainSha, `${VERIFY_DIR}/${name}`);
      if (text === null) continue;
      const file = parseVerifyFile(text);
      if (Object.hasOwn(file.tasks, key)) hits.push(file.tasks[key]!);
    }
    if (hits.length === 0) return `no entry for task "${key}"`;
    if (hits.length > 1) return `task "${key}" is in ${hits.length} verify files`;
    if (hits[0]!.green.length === 0) return `task "${key}" has an empty green`;
    return hits[0]!;
  }

  private async green(run: JobRun, state: Attempt): Promise<StepEnd> {
    if (state.planReason !== null) return { status: 'skip', output: state.planReason };
    const exam = await this.examOf(run, state.mainSha);
    if (typeof exam === 'string') return fail(exam);
    state.task = exam;
    let output = '';
    for (const entry of exam.green) {
      const result = await this.exec(run, state, entry.run, GREEN_MS);
      const text = combined(result);
      output += `${text}\n`;
      if (result.exitCode !== 0) return fail(`${whyNotPassed(result)}: ${entry.run}`, `${output}${whyNotPassed(result)}: ${entry.run}`, result.exitCode);
      const missing = entry.expect.find((expected) => !text.includes(expected));
      if (missing !== undefined) return fail(`missing "${missing}": ${entry.run}`, `${output}missing "${missing}": ${entry.run}`, 0);
    }
    return { status: 'pass', exitCode: 0, output };
  }

  private async stub(run: JobRun, state: Attempt): Promise<StepEnd> {
    if (state.planReason !== null) return { status: 'skip', output: state.planReason };
    const stub = state.task!.stub;
    if ('none' in stub) return { status: 'skip', output: stub.none };
    const problem = stubCommandProblem(stub.run);
    if (problem !== null) return fail(problem);
    const { workspace } = this.deps;
    const tree = state.tree!;
    try {
      await workspace.stubRestore(tree, state.files, state.config.testGlobs);
      const result = await this.exec(run, state, stub.run, STUB_MS);
      const text = combined(result);
      if (isRealRed(result)) return { status: 'pass', exitCode: result.exitCode, output: text };
      if (result.exitCode === 0) return fail('the tests pass with no implementation', text, 0);
      return fail(`the stub run proved nothing: ${whyNotPassed(result)}`, `${text}\nthe stub run proved nothing: ${whyNotPassed(result)}`, result.exitCode);
    } finally {
      await workspace.stubUndo(tree);
    }
  }

  /** Decision 38, on the commit that was checked. */
  private async ci(run: JobRun): Promise<StepEnd> {
    const { host, sleep } = this.deps;
    let seen = 0;
    for (let read = 1; read <= CI_READS; read++) {
      const checks = await host.checks(run.setting.githubRepo, run.job.headSha);
      seen = checks.length;
      const bad = checks.find((c) => (c.status === 'completed' || c.conclusion !== null) && !PASSING_CONCLUSIONS.has(c.conclusion ?? ''));
      if (bad) return fail(`check ${bad.name}: ${bad.conclusion ?? 'no conclusion'}`);
      if (checks.length > 0 && checks.every((c) => c.status === 'completed')) {
        return { status: 'pass', exitCode: 0, output: checks.map((c) => `${c.name}: ${c.conclusion}`).join('\n') };
      }
      if (read < CI_READS) await sleep(CI_WAIT_MS, run.signal);
    }
    return fail(seen === 0 ? 'no check run' : 'the check runs did not complete');
  }

  /** Decisions 35, 36. The merge always carries `job.headSha`, the commit that was checked. */
  private async merge(run: JobRun, repo: RepoRecord, state: Attempt, attempt: number): Promise<{ end: StepEnd; again: boolean }> {
    const { host, workspace } = this.deps;
    const { job, setting } = run;
    const pr = await host.pullRequest(setting.githubRepo, job.prNumber);
    const { mainSha } = await workspace.fetch(run.repoPath, { headRef: pr.headRef, headSha: job.headSha });
    if (mainSha !== state.mainSha) {
      if (attempt > 1) return { end: fail('main moved twice'), again: false };
      return { end: { status: 'skip', output: `main moved to ${mainSha}, the job runs again` }, again: true };
    }
    await host.setStatus(setting.githubRepo, job.headSha, { state: 'success', description: 'gate: every step passed' });
    await host.merge(setting.githubRepo, job.prNumber, job.headSha);
    return { end: { status: 'pass', exitCode: 0, output: `merged ${job.headSha}\n${await this.checkCommand(run, repo)}` }, again: false };
  }

  /** Decision 35: a failure here does not undo the merge, and its output goes to the step. */
  private async checkCommand(run: JobRun, repo: RepoRecord): Promise<string> {
    const { checkCommand } = run.setting;
    if (checkCommand.length === 0) return '';
    const argv = checkCommand.map((arg) => arg.replaceAll('{key}', run.job.taskKey));
    const result = await this.deps.commands.run({ argv, cwd: repo.path, timeoutMs: CHECK_COMMAND_MS });
    return `${combined(result)}\ncheck_command: ${result.exitCode === 0 ? 'exit 0' : whyNotPassed(result)}`;
  }
}
