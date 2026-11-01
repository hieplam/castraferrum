import type { Clock } from '../ports/clock';
import type { Repositories } from '../ports/repositories';
import type { RecoveryReport, RecoveryService } from './contracts';

export type RecoveryServiceDeps = Pick<Repositories, 'loops' | 'executions' | 'runs' | 'heartbeat' | 'probes'> & { clock: Clock };

/**
 * Server restart (UC-15, spec Q3, D9, decision 45) — main.ts calls this once, BEFORE the ticker and HTTP. Nothing is made up for:
 * `running` runs → `interrupted` (the executor runs inside the process, so with a new process the old run is certainly dead); the open
 * execution → closed as `server_down` at the last heartbeat; the loop → `stopped`. The one exception is a loop that was active with an open
 * execution and has a probe with `restartPolicy` `resume`: it stays active with its execution, and its held runs stay held. The probe tick
 * then starts its next task. So no loop with no probe, and no loop with the default policy, restarts by itself.
 */
export class DefaultRecoveryService implements RecoveryService {
  readonly #d: RecoveryServiceDeps;

  constructor(deps: RecoveryServiceDeps) {
    this.#d = deps;
  }

  async recover(): Promise<RecoveryReport> {
    const d = this.#d;
    const now = d.clock.now();
    const lastHeartbeatAt = await d.heartbeat.last();
    const shutdownAt = lastHeartbeatAt ?? now;
    const active = await d.loops.list({ status: 'active' });
    const keep = await this.#keptLoops(active.map((l) => l.id)); // read before anything closes: it depends on the open executions
    // The duration of an unfinished run counts up to the last heartbeat (when it really stopped running), finished_at = the restart time.
    // A held run of a loop that stops has no loop to resume in. The next probe tick releases the claims of these runs as excused.
    const interruptedRuns = (await d.runs.markAllRunningInterrupted(now, shutdownAt)) + (await d.runs.markHeldInterrupted(now, shutdownAt, keep));

    // For each running loop: endedAt = the last heartbeat, but not earlier than Start (Start right after the last heartbeat, then
    // the server dies → last heartbeat < startedAt; use startedAt so "how long it ran" is not negative, still off by at most 10 seconds).
    let closedExecutions = 0;
    let stoppedLoops = 0;
    for (const loop of active) {
      if (keep.includes(loop.id)) continue;
      const open = await d.executions.findOpen(loop.id);
      if (!open) continue;
      const endedAt = new Date(Math.max(shutdownAt.getTime(), open.startedAt.getTime()));
      if (await d.executions.close(loop.id, 'server_down', endedAt)) {
        closedExecutions++;
        stoppedLoops++; // close() puts the loop back to stopped in the same transaction
      }
    }
    // Safety net for data that breaks the invariant (an open execution while the loop is not active, an active loop without an open execution).
    closedExecutions += await d.executions.closeAllOpen('server_down', shutdownAt, keep);
    stoppedLoops += await d.loops.stopAll(now, keep);
    // Write a fresh heartbeat right away: if the server dies before the ticker's first beat, the next startup does not pick up the stale heartbeat.
    await d.heartbeat.beat(now);
    return { at: now, lastHeartbeatAt, interruptedRuns, closedExecutions, stoppedLoops };
  }

  /** Decision 45: an active loop stays active only with an open execution and a `resume` probe. */
  async #keptLoops(activeIds: string[]): Promise<string[]> {
    const d = this.#d;
    const kept = await Promise.all(
      activeIds.map(async (id) => (await d.probes.get(id))?.restartPolicy === 'resume' && (await d.executions.findOpen(id)) !== null),
    );
    return activeIds.filter((_, i) => kept[i]);
  }
}
