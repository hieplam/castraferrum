import { DomainError } from '../../shared/domain/errors';
import {
  cutBytes,
  parseProbeLine,
  PROBE_ACTION_STATE,
  PROBE_RAW_MAX_BYTES,
  RESERVED_RESOURCE,
  type ProbeRecord,
  type ProbeSettings,
  type ProbeState,
} from '../../shared/domain/goal-loop';
import type { Clock } from '../ports/clock';
import type { CommandResult, CommandRunner } from '../ports/command-runner';
import type { LoopRecord } from '../ports/loop-repository';
import type { Repositories } from '../ports/repositories';
import type { ProbeInput, ProbeService, ProbeTickReport, ProbeView, ValidationIssue } from './contracts';

export type ProbeServiceDeps = Pick<Repositories, 'loops' | 'probes' | 'repos' | 'runs'> & {
  commands: CommandRunner;
  clock: Clock;
};

const PROBE_EVERY_MS = 60_000;
const PROBE_TIMEOUT_MS = 30_000;

const BASE_PORT_MIN = 1024;
const BASE_PORT_MAX = 65_000;
const EVERY_SEC_MIN = 1;
const EVERY_SEC_MAX = 86_400;

/**
 * The probe of a loop: validates and stores its settings, and calls it on the tick (decision 22). The console reads one word and a
 * few opaque fields from a command that the loop owns, and it starts no session here (ADR 0004).
 */
export class DefaultProbeService implements ProbeService {
  readonly #d: ProbeServiceDeps;
  #busy = false;

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
      const { state, lastLine } = readResult(result);
      // The tick's `now`, not the time of the answer: a run that ends during the call is later than this mark, so it gives a new probe.
      await d.probes.record(loop.id, { state, lastLine, at: now });
      report.probed.push(loop.id);
      if (state === 'probe_failed') report.failed.push(loop.id);
    } catch (err) {
      report.errors.push({ loopId: probe.loopId, message: err instanceof Error ? err.message : String(err) });
    }
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
function readResult(result: CommandResult): { state: ProbeState; lastLine: string } {
  const failed = (text: string) => ({ state: 'probe_failed' as const, lastLine: cutBytes(text, PROBE_RAW_MAX_BYTES) });
  if (result.timedOut) return failed(`timed out after ${PROBE_TIMEOUT_MS / 1000} s`);
  if (result.exitCode !== 0) return failed(result.error ?? `exit ${result.exitCode}`);
  const parsed = parseProbeLine(result.stdout);
  if (!parsed.ok) return failed(parsed.raw || parsed.reason);
  return { state: PROBE_ACTION_STATE[parsed.line.action], lastLine: parsed.raw };
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
  const port = settings.laneBasePort;
  if (port !== null && (port < BASE_PORT_MIN || port > BASE_PORT_MAX)) {
    issues.push({ field: 'laneBasePort', code: 'outOfRange', message: `The base port must be ${BASE_PORT_MIN}-${BASE_PORT_MAX}` });
  }
  return { settings, issues };
}
