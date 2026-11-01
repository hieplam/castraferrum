import { DomainError } from '../../shared/domain/errors';
import {
  cutBytes,
  laneEnvOf,
  lowestFreeSlot,
  parseProbeLine,
  prNumberOf,
  PROBE_ACTION_STATE,
  PROBE_RAW_MAX_BYTES,
  RESERVED_RESOURCE,
  USAGE_LIMIT_END,
  type ProbeLine,
  type ProbeRecord,
  type ProbeSettings,
  type ProbeState,
} from '../../shared/domain/goal-loop';
import type { ClaimConfig, ClaimGateway, OrphanedClaim, TaskRef } from '../ports/claims';
import type { Clock } from '../ports/clock';
import type { CommandResult, CommandRunner } from '../ports/command-runner';
import type { GateRepository } from '../ports/gate-repository';
import type { HoldRecord } from '../ports/hold-repository';
import type { IdGenerator } from '../ports/ids';
import type { LoopRecord } from '../ports/loop-repository';
import type { Notifier } from '../ports/notifier';
import type { Repositories } from '../ports/repositories';
import type { RunRecord } from '../ports/run-repository';
import type { GateService, LoopService, ProbeInput, ProbeService, ProbeTickReport, ProbeView, RunService, ValidationIssue } from './contracts';
import { openHold } from './hold-open';

export type ProbeServiceDeps = Pick<Repositories, 'claims' | 'executions' | 'holds' | 'loops' | 'probes' | 'repos' | 'runs'> & {
  commands: CommandRunner;
  claimGateway: ClaimGateway;
  gate: Pick<GateRepository, 'getRepoGate'>;
  gateQueue: Pick<GateService, 'queue'>;
  runService: Pick<RunService, 'startClaimed'>;
  loopService: Pick<LoopService, 'finishGoal'>;
  clock: Clock;
  ids: IdGenerator;
  notifier: Notifier;
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
  /** Decision 45: `last_probe_at` survives a restart, and a restart must not wait up to 60 s. So the first tick of a process treats each probe as due. */
  #firstTick = true;

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
      const [probes, holds] = await Promise.all([this.#d.probes.list(), this.#d.holds.listOpen()]);
      // Together, so a hung probe delays no other loop: the command runner ends each call in 30 s.
      const first = this.#firstTick;
      this.#firstTick = false;
      await Promise.all(probes.map((p) => this.#probeLoop(p, holds, now, report, first)));
      return report;
    } finally {
      this.#busy = false;
    }
  }

  async #probeLoop(probe: ProbeRecord, holds: HoldRecord[], now: Date, report: ProbeTickReport, first: boolean): Promise<void> {
    const d = this.#d;
    try {
      const loop = await d.loops.findById(probe.loopId);
      if (!loop || loop.status !== 'active' || loop.archivedAt) return;
      if (holds.some((h) => h.resource === RESERVED_RESOURCE)) {
        // Decision 44: no probe call in a closed window. The last line and the last call stay, so the first tick after the hold probes at once.
        if (probe.state !== 'held') await d.probes.record(loop.id, { state: 'held', lastLine: probe.lastLine, at: probe.lastProbeAt ?? now });
        return;
      }
      if (!first && !(await this.#isDue(probe, now))) return;
      if ((await this.#lanesInUse(loop.id)).length >= loop.maxConcurrent) return; // no free lane: the answer cannot be used
      const repo = await d.repos.findById(loop.repoId);
      if (!repo) throw new Error(`Loop points at repo ${loop.repoId} which does not exist`);
      const result = await d.commands.run({ argv: probe.command, cwd: repo.path, timeoutMs: PROBE_TIMEOUT_MS });
      const before = parsePrevious(probe); // decision 46: read before `record`, which replaces the stored line
      const { state, lastLine, line } = readResult(result);
      // The tick's `now`, not the time of the answer: a run that ends during the call is later than this mark, so it gives a new probe.
      await d.probes.record(loop.id, { state, lastLine, at: now });
      report.probed.push(loop.id);
      if (state === 'probe_failed') report.failed.push(loop.id);
      await this.#announce(loop.id, probe.state, before, state, lastLine, line, now);
      if (line?.action === 'take') await this.#take(loop, probe, repo.path, line.tasks.map((t) => ({ key: t.key, resources: t.resources })), 'take', holds, now, report);
      if (line?.action === 'plan') await this.#take(loop, probe, repo.path, [{ key: line.plan!.key, resources: [] }], 'plan', holds, now, report, line.plan!.failing);
      if (line?.action === 'done') await this.#finish(loop.id);
      if (line?.action === 'hold') await openHold(d, { resource: line.resource!, reason: line.reason, until: dateOf(line.until), openedByRunId: null, now });
    } catch (err) {
      report.errors.push({ loopId: probe.loopId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Decision 46. The store keeps one unread notice per key, so after a read the same reason could come back each 60 s. So the tick sends only when the
   * stored line had another action or another reason. A probe that fails sends once, until a probe passes.
   */
  async #announce(loopId: string, was: ProbeState, before: ProbeLine | null, state: ProbeState, lastLine: string, line: ProbeLine | null, at: Date): Promise<void> {
    const d = this.#d;
    if (state === 'probe_failed') {
      if (was === 'probe_failed') return;
      await d.notifier.send({ dedupeKey: `probe_failed:${loopId}`, kind: 'probe_failed', loopId, messageKey: 'notice.probeFailed', params: { reason: lastLine }, at });
      return;
    }
    if (!line || (line.action !== 'wait' && line.action !== 'blocked')) return;
    if (before?.action === line.action && before.reason === line.reason) return;
    await d.notifier.send({
      dedupeKey: `${line.action}:${loopId}:${line.reason}`,
      kind: line.action,
      loopId,
      messageKey: line.action === 'wait' ? 'notice.wait' : 'notice.blocked',
      params: { reason: line.reason },
      at,
    });
  }

  /** Decision 46: `done` closes the period at once when no run of the loop lives. A live run closes it on the first probe after it ends. */
  async #finish(loopId: string): Promise<void> {
    if ((await this.#lanesInUse(loopId)).length === 0) await this.#d.loopService.finishGoal(loopId);
  }

  /**
   * Decision 23: `taken` goes to the next task, a refused claim closes its row, and the lanes end the list. A `plan` task (decision 46) has a row of kind `plan`
   * and calls no gateway, so no label exists: `taken` means that a run of this plan key lives, also a held one.
   */
  async #take(
    loop: LoopRecord,
    probe: ProbeRecord,
    cwd: string,
    tasks: TaskRef[],
    action: 'take' | 'plan',
    holds: HoldRecord[],
    now: Date,
    report: ProbeTickReport,
    failing?: string[],
  ): Promise<void> {
    const d = this.#d;
    const execution = await d.executions.findOpen(loop.id); // a Stop during the probe call leaves none
    if (!execution) return;
    const gateOn = (await d.gate.getRepoGate(loop.repoId))?.enabled === true; // before any claim: a failed read claims nothing
    const active = await this.#lanesInUse(loop.id); // read again: the probe call took time
    let lanes = loop.maxConcurrent - active.length;
    const used = active.map((r) => r.slot); // a slot taken in this tick joins the list, so two tasks of one tick never share it
    const cfg: ClaimConfig = { claim: probe.claim, release: probe.release, cwd };
    const held = new Set(holds.map((h) => h.resource));
    const kind = action === 'plan' ? 'plan' : 'task';
    for (const task of tasks) {
      if (lanes <= 0) return;
      if (task.resources.some((r) => held.has(r))) continue; // a named hold stops only the tasks that list it
      const claimId = d.ids.newId();
      const runId = d.ids.newId();
      if ((await d.claims.open({ id: claimId, loopId: loop.id, taskKey: task.key, runId, at: now, kind })) === 'taken') continue;
      const answer = kind === 'plan' ? { ok: true as const } : await d.claimGateway.claim(cfg, task);
      if (!answer.ok) {
        await d.claims.close(claimId, `refused: ${answer.reason}`, d.clock.now());
        continue;
      }
      const slot = lowestFreeSlot(used);
      const run = await d.runService.startClaimed(loop.id, execution.id, { runId, taskKey: task.key, slot, env: laneEnvOf(probe, slot, gateOn), action, ...(failing ? { failing } : {}), ...(gateOn ? { gateGuard: true } : {}) });
      if (run.status === 'skipped') await this.#endClaim({ id: claimId, loopId: loop.id, taskKey: task.key, kind, runStatus: 'skipped', endResult: null, endPr: null }, now, report);
      if (run.status !== 'running') return; // no lane after all, or a Stop came first: the orphan step ends what is left
      used.push(slot);
      lanes--;
    }
  }

  /** A held run keeps its lane and its slot, because it goes on with the same env (decision 24). */
  async #lanesInUse(loopId: string): Promise<RunRecord[]> {
    const [active, held] = await Promise.all([this.#d.runs.listActive(loopId), this.#d.runs.listHeld(loopId)]);
    return [...active, ...held];
  }

  /** A claim ends with its run, also for a stopped loop. So this reads every open claim, not the probes that are due. */
  async #releaseOrphans(now: Date, report: ProbeTickReport): Promise<void> {
    const orphans = await this.#d.claims.findOrphaned(ORPHANS_PER_TICK);
    const due = orphans.filter((c) => (this.#retryAt.get(c.id) ?? 0) <= now.getTime());
    await Promise.all(due.map((c) => this.#endClaim(c, now, report)));
  }

  /** A failed release or hand-over keeps the row open for a try 60 s later, so a `gh` failure cannot lose either of them. */
  async #endClaim(claim: EndingClaim, now: Date, report: ProbeTickReport): Promise<void> {
    const d = this.#d;
    const why = releaseWhy(claim);
    try {
      if (!(await this.#handOver(claim))) {
        const cfg = await this.#claimConfig(claim.loopId);
        if (cfg && claim.kind === 'task') await d.claimGateway.release(cfg, { key: claim.taskKey }, why); // a plan row has no label: it only closes
        await d.claims.close(claim.id, why.reason, now);
      }
      this.#retryAt.delete(claim.id);
    } catch (err) {
      this.#retryAt.set(claim.id, now.getTime() + RELEASE_RETRY_MS);
      report.errors.push({ loopId: claim.loopId, message: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Decision 47. Gives `false` when the gate does not take this claim, so it ends as today. The order is `queue`, then `handOver`: a throw leaves the row with its
   * run, and a restart between the two finds the same PR. `queue` then gives the live job, or a new job if the first one ended.
   */
  async #handOver(claim: EndingClaim): Promise<boolean> {
    const d = this.#d;
    if (claim.runStatus !== 'succeeded' || claim.endResult !== 'PR_OPEN') return false;
    const loop = await d.loops.findById(claim.loopId);
    const setting = loop && (await d.gate.getRepoGate(loop.repoId));
    if (!loop || !setting?.enabled) return false;
    const prNumber = prNumberOf(claim.endPr, setting.githubRepo);
    if (prNumber === null) return false;
    const { jobId } = await d.gateQueue.queue({ repoId: loop.repoId, prNumber, taskKey: claim.taskKey });
    if (jobId === null) throw new Error(`The gate job of PR ${prNumber} ended before the read`);
    await d.claims.handOver(claim.id, jobId);
    return true;
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

type EndingClaim = Pick<OrphanedClaim, 'id' | 'loopId' | 'taskKey' | 'kind' | 'runStatus' | 'endResult' | 'endPr'>;

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
 * Decision 23. A restart, a full lane and a run that never started are not the fault of the task, and `RESOURCE_DOWN` and a usage limit are not either: each
 * of them is excused, so it spends no attempt.
 */
function releaseWhy({ runStatus, endResult }: Pick<OrphanedClaim, 'runStatus' | 'endResult'>): { reason: string; excused: boolean } {
  const excused = runStatus === null || runStatus === 'interrupted' || runStatus === 'skipped' || endResult === 'RESOURCE_DOWN' || endResult === USAGE_LIMIT_END;
  return { reason: `run ${runStatus ?? 'missing'}${endResult ? ` ${endResult}` : ''}`, excused };
}

/** The line that the last probe stored, or `null` when none was stored, or it was a bad line. */
function parsePrevious(probe: ProbeRecord): ProbeLine | null {
  if (probe.lastLine === null) return null;
  const parsed = parseProbeLine(probe.lastLine);
  return parsed.ok ? parsed.line : null;
}

/** The `until` of a probe line. Text that is not a date counts as no end. */
function dateOf(text: string | null): Date | null {
  if (text === null) return null;
  const at = new Date(text);
  return Number.isNaN(at.getTime()) ? null : at;
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
