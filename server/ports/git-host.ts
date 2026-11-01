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

export interface GitHost {
  pullRequest(repo: string, number: number): Promise<PullRequest>;
  /** Sets the commit status `castraferrum/gate` on `sha`. */
  setStatus(repo: string, sha: string, status: { state: StatusState; description: string }): Promise<void>;
  checks(repo: string, sha: string): Promise<CheckRun[]>;
  /** Squash-merges the PR only if its head is still `headSha`. Throws a `GitHostError` otherwise. */
  merge(repo: string, number: number, headSha: string): Promise<void>;
  comment(repo: string, issue: number, body: string): Promise<void>;
  openIssue(repo: string, issue: { title: string; body: string; labels: string[] }): Promise<IssueRef>;
  searchIssues(repo: string, query: string): Promise<IssueHit[]>;
}
