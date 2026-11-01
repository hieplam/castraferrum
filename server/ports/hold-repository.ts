/** A stop on a resource (spec 2.5). `plan-window` stops every probe loop, and any other name stops the tasks that list it. */
export type HoldRecord = {
  id: string;
  resource: string;
  reason: string;
  openedAt: Date;
  /** `null` = the end is not known (decision 27). */
  until: Date | null;
  /** The last check or trial (decision 44). */
  checkedAt: Date | null;
  closedAt: Date | null;
  /** The run that opened the hold. A probe line opens a hold with no run. */
  openedByRunId: string | null;
  /** The run that tests a `plan-window` with no known end. */
  trialRunId: string | null;
};

export type OpenHoldInput = Pick<HoldRecord, 'id' | 'resource' | 'reason' | 'openedAt' | 'until' | 'openedByRunId'>;

export interface HoldRepository {
  /** `kept`: the resource already has an open hold (one partial unique index), so nothing is written. */
  open(input: OpenHoldInput): Promise<'opened' | 'kept'>;
  /** Writes `until` on the open hold of the resource when it is later than the stored value, or when the stored value is null. */
  raiseUntil(resource: string, until: Date): Promise<void>;
  /** Every open hold, oldest first. */
  listOpen(): Promise<HoldRecord[]>;
  /** Writes the time of a check or a trial, and the trial run (`null` for no trial). */
  markChecked(id: string, at: Date, trialRunId: string | null): Promise<void>;
  /** The first close stays: closing a closed row changes nothing. */
  close(id: string, at: Date): Promise<void>;
}
