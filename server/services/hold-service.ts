import { laneEnvOf, RESERVED_RESOURCE, type ProbeResource } from '../../shared/domain/goal-loop';
import type { Clock } from '../ports/clock';
import type { CommandRunner } from '../ports/command-runner';
import type { HoldRecord } from '../ports/hold-repository';
import type { Repositories } from '../ports/repositories';
import type { RunRecord } from '../ports/run-repository';
import type { HoldService, HoldTickReport, RunService } from './contracts';

export type HoldServiceDeps = Pick<Repositories, 'holds' | 'loops' | 'probes' | 'repos' | 'runs'> & {
  commands: CommandRunner;
  runService: Pick<RunService, 'resumeHeld'>;
  clock: Clock;
};

/** `plan-window` closes this long after `until`, so a reset that comes a little late does not cost a failed resume. */
const WINDOW_GRACE_MS = 60_000;
/** The time between two trials of a window with no end, and the life of a named hold with no check and no end. */
const NO_END_MS = 30 * 60_000;
const CHECK_TIMEOUT_MS = 30_000;

/**
 * The time rules of a hold (decision 44), with no model and no person. A `plan-window` hold ends at `until` plus 60 s, or by a trial when the end is not known.
 * While no `plan-window` hold is open, every held run resumes, oldest first over all loops, so a resume that failed is tried on the next tick.
 * A named hold ends by its check, at `until`, or after 30 minutes when it has neither: the next run tests the resource.
 */
export class DefaultHoldService implements HoldService {
  readonly #d: HoldServiceDeps;
  #busy = false;

  constructor(deps: HoldServiceDeps) {
    this.#d = deps;
  }

  async tick(): Promise<HoldTickReport> {
    const now = this.#d.clock.now();
    const report: HoldTickReport = { at: now, ran: false, errors: [] };
    if (this.#busy) return report; // the previous tick still waits for a check -> drop this tick, no overlap
    this.#busy = true;
    try {
      report.ran = true;
      for (const hold of await this.#d.holds.listOpen()) {
        try {
          if (hold.resource === RESERVED_RESOURCE) await this.#tickWindow(hold, now);
          else await this.#tickNamed(hold, now);
        } catch (err) {
          report.errors.push({ loopId: hold.id, message: errorText(err) });
        }
      }
      const open = await this.#d.holds.listOpen();
      if (!open.some((h) => h.resource === RESERVED_RESOURCE)) await this.#resumeAll(report);
      return report;
    } finally {
      this.#busy = false;
    }
  }

  async #tickWindow(hold: HoldRecord, now: Date): Promise<void> {
    const d = this.#d;
    if (hold.until) {
      if (now.getTime() >= hold.until.getTime() + WINDOW_GRACE_MS) await d.holds.close(hold.id, now);
      return;
    }
    if (hold.trialRunId) {
      const status = (await d.runs.findById(hold.trialRunId))?.status;
      if (status === 'running') return;
      if (status !== 'held') return d.holds.close(hold.id, now); // the trial ended with no new limit, so the window is open
    }
    if (now.getTime() - (hold.checkedAt ?? hold.openedAt).getTime() < NO_END_MS) return;
    const [oldest] = await d.runs.listAllHeld();
    if (!oldest) return d.holds.close(hold.id, now); // no run can ever be the trial, and the next run tests the window
    await this.#resume(oldest);
    await d.holds.markChecked(hold.id, now, oldest.id);
  }

  async #tickNamed(hold: HoldRecord, now: Date): Promise<void> {
    const d = this.#d;
    if (hold.until && now.getTime() >= hold.until.getTime()) return d.holds.close(hold.id, now);
    const entry = await this.#checkOf(hold.resource);
    if (!entry) {
      if (!hold.until && now.getTime() - hold.openedAt.getTime() >= NO_END_MS) await d.holds.close(hold.id, now);
      return;
    }
    if (now.getTime() - (hold.checkedAt ?? hold.openedAt).getTime() < entry.resource.everySec * 1000) return;
    const result = await d.commands.run({ argv: entry.resource.check, cwd: entry.cwd, timeoutMs: CHECK_TIMEOUT_MS });
    if (result.exitCode === 0 && !result.timedOut) await d.holds.close(hold.id, now);
    else await d.holds.markChecked(hold.id, now, null);
  }

  /** The first probe of any loop that names this resource, also of a stopped loop: a resource does not depend on one loop. */
  async #checkOf(name: string): Promise<{ resource: ProbeResource; cwd: string } | null> {
    const d = this.#d;
    for (const probe of await d.probes.list()) {
      const resource = probe.resources.find((r) => r.name === name);
      if (!resource) continue;
      const loop = await d.loops.findById(probe.loopId);
      const repo = loop && (await d.repos.findById(loop.repoId));
      if (repo) return { resource, cwd: repo.path };
    }
    return null;
  }

  async #resumeAll(report: HoldTickReport): Promise<void> {
    for (const run of await this.#d.runs.listAllHeld()) {
      try {
        await this.#resume(run);
      } catch (err) {
        report.errors.push({ loopId: run.loopId, message: errorText(err) });
      }
    }
  }

  /** The env is not stored: it comes again from `runs.slot` (decision 24). */
  async #resume(run: RunRecord): Promise<void> {
    const probe = await this.#d.probes.get(run.loopId);
    await this.#d.runService.resumeHeld(run.id, { env: probe && run.slot !== null ? laneEnvOf(probe, run.slot) : {} });
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
