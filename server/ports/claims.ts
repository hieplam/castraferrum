import type { ProbeSettings } from '../../shared/domain/goal-loop';
import type { RunStatus } from '../../shared/domain/run';

// Claims (spec 2.4, decision 23): the console holds a task for one run. The order is `open`, `claim`, run, so two ticks cannot start one task.

/** A task of a probe line. The console reads no meaning from `key`. */
export type TaskRef = { key: string; resources: string[] };

/** The argv commands of a loop's probe row, and the folder that they run in. */
export type ClaimConfig = Pick<ProbeSettings, 'claim' | 'release'> & { cwd: string };

export type ClaimResult = { ok: true } | { ok: false; reason: string };

export type ReleaseWhy = { reason: string; excused: boolean };

export interface ClaimGateway {
  /** A command that says no gives `ok: false`. Throws when the answer is not known (a time-out): the claim can be on the task. */
  claim(cfg: ClaimConfig, task: TaskRef): Promise<ClaimResult>;
  /** Throws on a failed command, so that the claim row stays open and the tick tries again. Releases only a task that is still claimed. */
  release(cfg: ClaimConfig, task: Pick<TaskRef, 'key'>, why: ReleaseWhy): Promise<void>;
}

export type ClaimOwner = 'run' | 'gate';

export type ClaimRecord = {
  id: string;
  loopId: string;
  taskKey: string;
  runId: string;
  openedAt: Date;
  closedAt: Date | null;
  closeReason: string | null;
  /** Decision 4: one owner. A run owns the row until the gate takes it over with `handOver`. */
  owner: ClaimOwner;
  /** Set when, and only when, `owner` is `gate`. */
  gateJobId: string | null;
};

export type OpenClaimInput = { id: string; loopId: string; taskKey: string; runId: string; at: Date };

/** `runStatus` is `null` when the row has no run. */
export type OrphanedClaim = ClaimRecord & { runStatus: RunStatus | null; endResult: string | null };

export interface ClaimRepository {
  /** `taken`: the loop already has an open row for this task key. */
  open(input: OpenClaimInput): Promise<'opened' | 'taken'>;
  /** The open rows of the loop, oldest first. */
  listOpen(loopId: string): Promise<ClaimRecord[]>;
  /** The first close stays: closing a closed row changes nothing. */
  close(id: string, reason: string, at: Date): Promise<void>;
  /** Gives an open row to the gate job. `false` when the row is closed or unknown. The job must exist. */
  handOver(id: string, gateJobId: string): Promise<boolean>;
  /** Open rows that a run owns, whose run is neither running nor held, or has no row at all, oldest first. A row that the gate owns is never orphaned. */
  findOrphaned(limit: number): Promise<OrphanedClaim[]>;
}
