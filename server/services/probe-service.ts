import { DomainError } from '../../shared/domain/errors';
import {
  cutBytes,
  laneEnvOf,
  lowestFreeSlot,
  parseProbeLine,
  PROBE_ACTION_STATE,
  PROBE_RAW_MAX_BYTES,
  RESERVED_RESOURCE,
  type ProbeLine,
  type ProbeRecord,
  type ProbeSettings,
  type ProbeState,
} from '../../shared/domain/goal-loop';
import type { ClaimConfig, ClaimGateway, OrphanedClaim } from '../ports/claims';
import type { Clock } from '../ports/clock';
import type { CommandResult, CommandRunner } from '../ports/command-runner';
import type { IdGenerator } from '../ports/ids';
import type { LoopRecord } from '../ports/loop-repository';
import type { Repositories } from '../ports/repositories';
import type { ProbeInput, ProbeService, ProbeTickReport, ProbeView, RunService, ValidationIssue } from './contracts';

export type ProbeServiceDeps = Pick<Repositories, 'claims' | 'executions' | 'loops' | 'probes' | 'repos' | 'runs'> & {
  commands: CommandRunner;
  claimGateway: ClaimGateway;
  runService: Pick<RunService, 'startClaimed'>;
  clock: Clock;
  ids: IdGenerator;
};

const PROBE_EVERY_MS = 60_000;
const PROBE_TIMEOUT_MS = 30_000;
const RELEASE_RETRY_MS = 60_000;
const ORPHANS_PER_TICK = 50;

const BASE_PORT_MIN = 1024;
const BASE_PORT_MAX = 65_000;
const EVERY_SEC_MIN = 1;
const EVERY_SEC_MAX = 86_400;

/**
 * The probe of a loop: validates and stores its settings, and calls it on the tick (decision 22). The console reads one word and a
 * few opaque fields from a command that the loop owns (ADR 0004). A tick first ends the claims of finished runs, then starts the tasks of a
 * `take` (decision 23). The order is `open`, `claim`, run, so a claim always has its row before it exists on the task.
 */
export class DefaultProbeService implements ProbeService {
  readonly #d: ProbeServiceDeps;
  #busy = false;
  /** Claim id -> the time of the next try, after a failed release. In memory: a restart only gives an earlier try. */
  readonly #retryAt = new Map<string, number>();

  constructor(deps: ProbeServiceDeps) {
    this.#d = deps;
  }

  async get(loopId: string): Promise<ProbeView | null> {
    await this.#load(loopId);
    return this.#d.probes.get(loopId);
  }

  async save(loopId: string, input: ProbeInput): Promise<ProbeView> {
    this.#assertEditable(await this.#load(loopId));
    const { settings, issues } = clean(input);
    if (issues.length > 0) throw new DomainError('VALIDATION_FAILED', 'Invalid probe settings', { issues });
    return this.#d.probes.upsert(loopId, settings);
  }

  async remove(loopId: string): Promise<void> {
    this.#assertEditable(await this.#load(loopId));
    await this.#d.probes.remove(loopId);
  }

  async tick(): Promise<ProbeTickReport> {
    const now = this.#d.clock.now();
    const report: ProbeTickReport = { at: now, ran: false, probed: [], failed: [], errors: [] };
    if (this.#busy) return report; // the previous tick still waits for a probe -> drop this tick, no overlap
    this.#busy = true;
    try {
      report.ran = true;
      await this.#releaseOrphans(now, report); // first, so that a probe sees the tasks that this tick freed
      const probes = await this.#d.probes.list();
      // Together, so a hung probe delays no other loop: the command runner ends each call in 30 s.
      await Promise.all(probes.map((p) => this.#probeLoop(p, now, report)));
      return report;
    } finally {
      this.#busy = false;
    }
  }

  async #probeLoop(probe: ProbeRecord, now: Date, report: ProbeTickReport): Promise<void> {
    const d = this.#d;
    try {
      const loop = await d.loops.findById(probe.loopId);
      if (!loop || loop.status !== 'active' || loop.archivedAt) return;
      if (!(await this.#isDue(probe, now))) return;
      if ((await d.runs.listActive(loop.id)).length >= loop.maxConcurrent) return; // no free lane: the answer cannot be used
      const repo = await d.repos.findById(loop.repoId);
      if (!repo) throw new Error(`Loop points at repo ${loop.repoId} which does not exist`);
      const result = await d.commands.run({ argv: probe.command, cwd: repo.path, timeoutMs: PROBE_TIMEOUT_MS });
      const { state, lastLine, line } = readResult(result);
      // The tick's `now`, not the time of the answer: a run that ends during the call is later than this mark, so it gives a new probe.
      await d.probes.record(loop.id, { state, lastLine, at: now });
      report.probed.push(loop.id);
      if (state === 'probe_failed') report.failed.push(loop.id);
      if (line?.action === 'take') await this.#take(loop, probe, repo.path, line, now, report);
    } catch (err) {
      report.errors.push({ loopId: probe.loopId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Decision 23: `taken` goes to the next task, a refused claim closes its row, and the lanes end the list. */
  async #take(loop: LoopRecord, probe: ProbeRecord, cwd: string, line: ProbeLine, now: Date, report: ProbeTickReport): Promise<void> {
    const d = this.#d;
    const execution = await d.executions.findOpen(loop.id); // a Stop during the probe call leaves none
    if (!execution) return;
    const active = await d.runs.listActive(loop.id); // read again: the probe call took time
    let lanes = loop.maxConcurrent - active.length;
    const used = active.map((r) => r.slot); // a slot taken in this tick joins the list, so two tasks of one tick never share it
    const cfg: ClaimConfig = { claim: probe.claim, release: probe.release, cwd };
    for (const task of line.tasks) {
      if (lanes <= 0) return;
      const claimId = d.ids.newId();
      const runId = d.ids.newId();
      if ((await d.claims.open({ id: claimId, loopId: loop.id, taskKey: task.key, runId, at: now })) === 'taken') continue;
      const answer = await d.claimGateway.claim(cfg, task);
      if (!answer.ok) {
        await d.claims.close(claimId, `refused: ${answer.reason}`, d.clock.now());
        continue;
      }
      const slot = lowestFreeSlot(used);
      const run = await d.runService.startClaimed(loop.id, execution.id, { runId, taskKey: task.key, slot, env: laneEnvOf(probe, slot), action: line.action === 'plan' ? 'plan' : 'take' });
      if (run.status === 'skipped') await this.#endClaim({ id: claimId, loopId: loop.id, taskKey: task.key, runStatus: 'skipped', endResult: null }, now, report);
      if (run.status !== 'running') return; // no lane after all, or a Stop came first: the orphan step ends what is left
      used.push(slot);
      lanes--;
    }
  }

  /** A claim ends with its run, also for a stopped loop. So this reads every open claim, not the probes that are due. */
  async #releaseOrphans(now: Date, report: ProbeTickReport): Promise<void> {
    const orphans = await this.#d.claims.findOrphaned(ORPHANS_PER_TICK);
    const due = orphans.filter((c) => (this.#retryAt.get(c.id) ?? 0) <= now.getTime());
    await Promise.all(due.map((c) => this.#endClaim(c, now, report)));
  }

  /** A failed release keeps the row open for a try 60 s later, so a `gh` failure cannot lose a release. */
  async #endClaim(claim: Pick<OrphanedClaim, 'id' | 'loopId' | 'taskKey' | 'runStatus' | 'endResult'>, now: Date, report: ProbeTickReport): Promise<void> {
    const d = this.#d;
    const why = releaseWhy(claim);
    try {
      const cfg = await this.#claimConfig(claim.loopId);
      if (cfg) await d.claimGateway.release(cfg, { key: claim.taskKey }, why);
      await d.claims.close(claim.id, why.reason, now);
      this.#retryAt.delete(claim.id);
    } catch (err) {
      this.#retryAt.set(claim.id, now.getTime() + RELEASE_RETRY_MS);
      report.errors.push({ loopId: claim.loopId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** `null`: the owner removed the probe of a stopped loop. No release command is left, so the row can only close. */
  async #claimConfig(loopId: string): Promise<ClaimConfig | null> {
    const d = this.#d;
    const [probe, loop] = await Promise.all([d.probes.get(loopId), d.loops.findById(loopId)]);
    const repo = loop && (await d.repos.findById(loop.repoId));
    if (!probe || !repo) return null;
    return { claim: probe.claim, release: probe.release, cwd: repo.path };
  }

  async #isDue(probe: ProbeRecord, now: Date): Promise<boolean> {
    const last = probe.lastProbeAt?.getTime();
    if (last === undefined || now.getTime() - last >= PROBE_EVERY_MS) return true;
    const finished = await this.#d.runs.latestFinishedAt(probe.loopId);
    return finished !== null && finished.getTime() > last;
  }

  async #load(loopId: string): Promise<LoopRecord> {
    const loop = await this.#d.loops.findById(loopId);
    if (!loop) throw new DomainError('LOOP_NOT_FOUND', `No loop ${loopId}`);
    return loop;
  }

  #assertEditable(loop: LoopRecord): void {
    if (loop.archivedAt) throw new DomainError('LOOP_ARCHIVED', 'The loop is archived. Restore it before you change its probe');
    if (loop.status === 'active') throw new DomainError('LOOP_IS_ACTIVE', 'The loop is running. Stop it before you change its probe');
  }
}

/** Spec 2.1: only exit 0 with a valid last line counts. Each other result gives `probe_failed`, with the raw line or the error. */
function readResult(result: CommandResult): { state: ProbeState; lastLine: string; line: ProbeLine | null } {
  const failed = (text: string) => ({ state: 'probe_failed' as const, lastLine: cutBytes(text, PROBE_RAW_MAX_BYTES), line: null });
  if (result.timedOut) return failed(`timed out after ${PROBE_TIMEOUT_MS / 1000} s`);
  if (result.exitCode !== 0) return failed(result.error ?? `exit ${result.exitCode}`);
  const parsed = parseProbeLine(result.stdout);
  if (!parsed.ok) return failed(parsed.raw || parsed.reason);
  return { state: PROBE_ACTION_STATE[parsed.line.action], lastLine: parsed.raw, line: parsed.line };
}

/**
 * Decision 23. A restart, a full lane and a run that never started are not the fault of the task, and `RESOURCE_DOWN` is not either: each of them is
 * excused, so it spends no attempt.
 */
function releaseWhy({ runStatus, endResult }: Pick<OrphanedClaim, 'runStatus' | 'endResult'>): { reason: string; excused: boolean } {
  const excused = runStatus === null || runStatus === 'interrupted' || runStatus === 'skipped' || endResult === 'RESOURCE_DOWN';
  return { reason: `run ${runStatus ?? 'missing'}${endResult ? ` ${endResult}` : ''}`, excused };
}

/** Defaults plus the data rules of spec 2.1: an argv has the placeholders `{key}` and `{reason}`; `plan-window` is reserved. */
function clean(input: ProbeInput): { settings: ProbeSettings; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const settings: ProbeSettings = {
    command: input.command,
    claim: input.claim ?? [],
    release: input.release ?? [],
    resources: input.resources ?? [],
    laneEnv: input.laneEnv ?? {},
    laneBasePort: input.laneBasePort ?? null,
    restartPolicy: input.restartPolicy ?? 'stop',
  };
  const has = (argv: string[], placeholder: string) => argv.some((a) => a.includes(placeholder));
  const empty = (argv: string[]) => argv.length === 0 || argv.some((a) => a === '');

  if (settings.command.length === 0 || settings.command[0] === '') {
    issues.push({ field: 'command', code: 'required', message: 'Enter the probe command' });
  }
  if (settings.claim.length > 0 && !has(settings.claim, '{key}')) {
    issues.push({ field: 'claim', code: 'missingKey', message: 'The claim command needs the placeholder {key}' });
  }
  if (settings.release.length > 0 && !has(settings.release, '{key}')) {
    issues.push({ field: 'release', code: 'missingKey', message: 'The release command needs the placeholder {key}' });
  }
  if (settings.release.length > 0 && !has(settings.release, '{reason}')) {
    issues.push({ field: 'release', code: 'missingReason', message: 'The release command needs the placeholder {reason}' });
  }
  for (const r of settings.resources) {
    if (r.name === RESERVED_RESOURCE) {
      issues.push({ field: 'resources', code: 'reserved', message: `The resource name "${RESERVED_RESOURCE}" is reserved for the plan window` });
    } else if (r.name.trim() === '' || empty(r.check)) {
      issues.push({ field: 'resources', code: 'required', message: 'Each resource needs a name and a check command' });
    } else if (r.everySec < EVERY_SEC_MIN || r.everySec > EVERY_SEC_MAX) {
      issues.push({ field: 'resources', code: 'outOfRange', message: `everySec must be ${EVERY_SEC_MIN}-${EVERY_SEC_MAX}` });
    }
  }
  if (settings.laneBasePort === null && Object.values(settings.laneEnv).some((v) => v.includes('{port}'))) {
    issues.push({ field: 'laneEnv', code: 'missingBasePort', message: 'lane_env uses {port}, so set the base port' });
  }
  const port = settings.laneBasePort;
  if (port !== null && (port < BASE_PORT_MIN || port > BASE_PORT_MAX)) {
    issues.push({ field: 'laneBasePort', code: 'outOfRange', message: `The base port must be ${BASE_PORT_MIN}-${BASE_PORT_MAX}` });
  }
  return { settings, issues };
}
