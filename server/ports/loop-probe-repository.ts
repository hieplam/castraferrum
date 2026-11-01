import type { ProbeRecord, ProbeSettings, ProbeState } from '../../shared/domain/goal-loop';

/** The probe of a loop (table `loop_probes`). One row for each loop; a loop with no row has no probe. */
export interface LoopProbeRepository {
  get(loopId: string): Promise<ProbeRecord | null>;
  /** Every probe, ordered by loop id. */
  list(): Promise<ProbeRecord[]>;
  /**
   * Inserts the row with state `active`, or replaces the settings of the existing row.
   * An existing row keeps its state, last line and last probe time. Throws `LOOP_NOT_FOUND` for an unknown loop.
   */
  upsert(loopId: string, settings: ProbeSettings): Promise<ProbeRecord>;
  /** Deletes the row. A loop with no row is not an error. */
  remove(loopId: string): Promise<void>;
  /** Stores the result of a probe call. A loop with no row is not an error. */
  record(loopId: string, result: { state: ProbeState; lastLine: string | null; at: Date }): Promise<void>;
}
