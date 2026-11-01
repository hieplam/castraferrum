import type { GoalRunRecord, StandingGoalRecord, StandingIssueRecord, StandingScheduleRecord } from '../../shared/domain/standing-goal';

export type NewStandingIssueRecord = Pick<StandingIssueRecord, 'id' | 'repo' | 'rowId' | 'fingerprint' | 'issueNumber' | 'openedAt'>;

/** Standing goals (tables `standing_goals`, `standing_issues` and `standing_schedule`). */
export interface GoalRepository {
  getGoal(repo: string, rowId: string): Promise<StandingGoalRecord | null>;
  /** Inserts the row, or replaces the row of the same repository and row id. */
  saveGoal(goal: StandingGoalRecord): Promise<void>;
  /** The open issue with this fingerprint, if there is one. */
  findOpen(repo: string, fingerprint: string): Promise<StandingIssueRecord | null>;
  /** The open issues of a row, oldest first. */
  listOpen(repo: string, rowId: string): Promise<StandingIssueRecord[]>;
  /** Stores an open issue with one failed pass. Rejects when the repository has an open issue with this fingerprint. */
  open(issue: NewStandingIssueRecord): Promise<StandingIssueRecord>;
  /** Adds 1 to the failed passes and sets the last failure time. Rejects for an unknown id. */
  touch(id: string, at: Date): Promise<StandingIssueRecord>;
  /** Marks the issue closed. An unknown or closed issue is not an error, and a closed issue keeps its first time. */
  close(id: string, at: Date): Promise<void>;
  getSchedule(repo: string): Promise<StandingScheduleRecord | null>;
  /** Inserts the row, or replaces the row of the same repository. */
  saveSchedule(schedule: StandingScheduleRecord): Promise<void>;
  /** Inserts each row, or replaces the row of the same repository, manifest and row id. */
  saveRows(rows: GoalRunRecord[]): Promise<void>;
  /** The last result of each row of a manifest, by row id. */
  listRows(repo: string, manifest: string): Promise<GoalRunRecord[]>;
}
