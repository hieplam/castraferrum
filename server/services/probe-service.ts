import { DomainError } from '../../shared/domain/errors';
import { RESERVED_RESOURCE, type ProbeSettings } from '../../shared/domain/goal-loop';
import type { LoopRecord } from '../ports/loop-repository';
import type { Repositories } from '../ports/repositories';
import type { ProbeInput, ProbeService, ProbeView, ValidationIssue } from './contracts';

export type ProbeServiceDeps = Pick<Repositories, 'loops' | 'probes'>;

const BASE_PORT_MIN = 1024;
const BASE_PORT_MAX = 65_000;
const EVERY_SEC_MIN = 1;
const EVERY_SEC_MAX = 86_400;

/** Probe settings of a loop: validates them and stores them. P4 adds the tick that calls the probe. */
export class DefaultProbeService implements ProbeService {
  readonly #d: ProbeServiceDeps;

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
