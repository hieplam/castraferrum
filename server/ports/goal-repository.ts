import type { GoalRunRecord, StandingGoalRecord, StandingIssueRecord, StandingScheduleRecord } from '../../shared/domain/standing-goal';

export type NewStandingIssueRecord = Pick<StandingIssueRecord, 'id' | 'repo' | 'rowId' | 'fingerprint' | 'issueNumber' | 'openedAt'>;

/** One goal manifest that has stored rows: the newest row time of the manifest and the commit of that row. */
export type GoalManifestRun = { manifest: string; at: Date; sha: string };

/** A standing goal with every issue of it, closed ones too, oldest first. */
export type StandingGoalEntry = StandingGoalRecord & { issues: StandingIssueRecord[] };

/** Standing goals and goal rows (tables `standing_goals`, `standing_issues`, `standing_schedule` and `goal_runs`). */
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
  /** The manifests of a repository that have stored rows, the newest first, then by path. The sha is the one of the newest row. */
  listManifests(repo: string): Promise<GoalManifestRun[]>;
  /** The standing goals of a repository by row id, each with all of its issues, oldest first. */
  listGoals(repo: string): Promise<StandingGoalEntry[]>;
}
