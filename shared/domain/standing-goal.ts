// Standing goals (spec 2.10): checks that a repository must keep passing. A check that fails gives one GitHub issue.

export const STANDING_GOAL_STATES = ['passing', 'failing'] as const;
export type StandingGoalState = (typeof STANDING_GOAL_STATES)[number];

/** The last result of one row of `goals/health.json` in one repository. */
export type StandingGoalRecord = {
  repo: string;
  rowId: string;
  state: StandingGoalState;
  lastLine: string | null;
  lastRunAt: Date;
};

/** One GitHub issue that the console tracks for a failure. `closedAt` is `null` while the issue is open. */
export type StandingIssueRecord = {
  id: string;
  repo: string;
  rowId: string;
  fingerprint: string;
  issueNumber: number;
  openedAt: Date;
  lastFailedAt: Date;
  /** The number of passes that failed with this fingerprint. */
  failCount: number;
  closedAt: Date | null;
};

export type GoalCadence = 'merge' | 'nightly';

/** The last result of one row of a goal manifest (decision 42). `manifest` is the path of the file, for example `goals/x.json`. */
export type GoalRunRecord = {
  repo: string;
  manifest: string;
  rowId: string;
  pass: boolean;
  value: number | null;
  of: number | null;
  line: string;
  cadence: GoalCadence;
  sha: string;
  at: Date;
};

/** When the standing goals of a repository ran last and run next. `nextAt` is `null` when the cron has no later time. */
export type StandingScheduleRecord = {
  repo: string;
  lastAt: Date;
  nextAt: Date | null;
};
