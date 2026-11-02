/** The pull request, issue and check calls that the gate needs from the Git host (GitHub). `repo` is `owner/name`. */
export type PullRequestState = 'OPEN' | 'CLOSED' | 'MERGED';

export type PullRequest = {
  number: number;
  /** The commit at the tip of the PR branch. */
  headSha: string;
  headRef: string;
  baseRef: string;
  state: PullRequestState;
  title: string;
  body: string;
  url: string;
  mergedAt: string | null;
  /** Numbers of the issues that the PR closes. */
  closingIssues: number[];
};

export type StatusState = 'pending' | 'success' | 'failure' | 'error';

export type CheckRun = {
  name: string;
  /** For example `queued`, `in_progress`, `completed`. */
  status: string;
  /** `null` until the check run completes. */
  conclusion: string | null;
};

export type IssueRef = { number: number; url: string };

/** An open issue with its text. */
export type LabeledIssue = { number: number; title: string; body: string };

export type IssueHit = { number: number; title: string; state: 'OPEN' | 'CLOSED'; url: string };

/** A call to the Git host that did not succeed. `exitCode` is `null` when the program did not start or timed out. */
export class GitHostError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'GitHostError';
  }
}

/** `gh pr view` printed that the pull request does not exist. Other `gh` failures (network, rights, timeout) stay a plain `GitHostError`. */
export class PullRequestNotFoundError extends GitHostError {
  constructor(readonly number: number, exitCode: number | null, stderr: string) {
    super(`Pull request ${number} does not exist`, exitCode, stderr);
    this.name = 'PullRequestNotFoundError';
  }
}

/** One issue comment that starts with `loop-release:`. `id` is the id of the comment on the host. */
export type LoopComment = { issue: number; id: string; at: Date; body: string };

export interface GitHost {
  pullRequest(repo: string, number: number): Promise<PullRequest>;
  /** Sets the commit status `castraferrum/gate` on `sha`. */
  setStatus(repo: string, sha: string, status: { state: StatusState; description: string }): Promise<void>;
  /** The state of the commit status `castraferrum/gate` on `sha`, or `null` when the commit has none. */
  gateStatus(repo: string, sha: string): Promise<StatusState | null>;
  checks(repo: string, sha: string): Promise<CheckRun[]>;
  /** Squash-merges the PR only if its head is still `headSha`. Throws a `GitHostError` otherwise. */
  merge(repo: string, number: number, headSha: string): Promise<void>;
  comment(repo: string, issue: number, body: string): Promise<void>;
  /** Makes sure that the label exists (`gh label create --force`), so that `openIssue` can use it. Safe to call again. */
  ensureLabel(repo: string, name: string): Promise<void>;
  openIssue(repo: string, issue: { title: string; body: string; labels: string[] }): Promise<IssueRef>;
  searchIssues(repo: string, query: string): Promise<IssueHit[]>;
  closeIssue(repo: string, number: number): Promise<void>;
  editIssueBody(repo: string, number: number, body: string): Promise<void>;
  /**
   * The comments that start with `loop-release:`, on the issues updated on or after the day of `since`. Throws a `GitHostError` when the
   * host gives 1000 issues, because the list can be cut off.
   */
  loopComments(repo: string, since: Date): Promise<LoopComment[]>;
  issueState(repo: string, number: number): Promise<'OPEN' | 'CLOSED'>;
  /** The open issues that have the label. Throws a `GitHostError` when the host gives 200 issues, because the list can be cut off. */
  issuesWithLabel(repo: string, label: string): Promise<LabeledIssue[]>;
  issueBody(repo: string, number: number): Promise<string>;
  /** Adds `child` to the sub-issues of `parent`. */
  addSubIssue(repo: string, parent: number, child: number): Promise<void>;
}
