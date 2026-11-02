/** The plan window of the account (spec 2.14). `null` means not known, and the rank rule then refuses. */
export type PlanWindowValue = { utilization: number | null; resetsAt: Date | null };

export interface PlanWindow {
  /** Never rejects: a failed read gives the unknown value. */
  read(): Promise<PlanWindowValue>;
}
