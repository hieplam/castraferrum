import type { CommandRunner } from '../../ports/command-runner';
import {
  GitHostError,
  type CheckRun,
  type GitHost,
  type IssueHit,
  type IssueRef,
  type PullRequest,
  type StatusState,
} from '../../ports/git-host';

const TIMEOUT_MS = 60_000;
const STATUS_CONTEXT = 'castraferrum/gate';
const MAX_DESCRIPTION = 140;
const MAX_COMMENT = 20_000;
const PR_FIELDS = 'number,headRefOid,headRefName,baseRefName,state,title,body,url,mergedAt,closingIssuesReferences';

export type GhGitHostOptions = {
  runner: CommandRunner;
  /** The `gh` program. A path that ends in `.mjs` runs as a script of the current Node (tests use the fake gh). */
  ghBin: string;
  cwd?: string;
};

/** The `GitHost` of GitHub: runs `gh` with no shell. Every call names its repository with `-R` or in the API path. */
export class GhGitHost implements GitHost {
  constructor(private readonly opts: GhGitHostOptions) {}

  private async gh(args: string[]): Promise<string> {
    const { runner, ghBin, cwd = process.cwd() } = this.opts;
    const argv = ghBin.endsWith('.mjs') ? [process.execPath, ghBin, ...args] : [ghBin, ...args];
    const r = await runner.run({ argv, cwd, timeoutMs: TIMEOUT_MS });
    if (r.exitCode !== 0) {
      const why = r.timedOut ? 'timed out' : (r.error ?? `exit ${r.exitCode}`);
      throw new GitHostError(`gh ${args.slice(0, 2).join(' ')} failed: ${why}`, r.exitCode, r.stderr);
    }
    return r.stdout;
  }

  private async json<T>(args: string[]): Promise<T> {
    const out = await this.gh(args);
    try {
      return JSON.parse(out) as T;
    } catch {
      throw new GitHostError(`gh ${args.slice(0, 2).join(' ')} printed text that is not JSON`, 0, out.slice(0, 500));
    }
  }

  async pullRequest(repo: string, number: number): Promise<PullRequest> {
    const raw = await this.json<{
      number: number;
      headRefOid: string;
      headRefName: string;
      baseRefName: string;
      state: PullRequest['state'];
      title: string;
      body: string;
      url: string;
      mergedAt: string | null;
      closingIssuesReferences: { number: number }[] | null;
    }>(['pr', 'view', String(number), '-R', repo, '--json', PR_FIELDS]);
    return {
      number: raw.number,
      headSha: raw.headRefOid,
      headRef: raw.headRefName,
      baseRef: raw.baseRefName,
      state: raw.state,
      title: raw.title,
      body: raw.body,
      url: raw.url,
      mergedAt: raw.mergedAt ?? null,
      closingIssues: (raw.closingIssuesReferences ?? []).map((i) => i.number),
    };
  }

  async setStatus(repo: string, sha: string, status: { state: StatusState; description: string }): Promise<void> {
    await this.gh([
      'api',
      '-X',
      'POST',
      `repos/${repo}/statuses/${sha}`,
      '-f',
      `state=${status.state}`,
      '-f',
      `context=${STATUS_CONTEXT}`,
      '-f',
      `description=${status.description.slice(0, MAX_DESCRIPTION)}`,
    ]);
  }

  async checks(repo: string, sha: string): Promise<CheckRun[]> {
    // `-X GET` is needed: `gh api` switches to POST when it gets `-f` fields.
    const raw = await this.json<{ check_runs?: { name: string; status: string; conclusion: string | null }[] }>([
      'api',
      '-X',
      'GET',
      `repos/${repo}/commits/${sha}/check-runs`,
      '-f',
      'per_page=100',
    ]);
    return (raw.check_runs ?? []).map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion ?? null }));
  }

  /** `--match-head-commit` makes GitHub refuse the merge when the PR head is not `headSha`. */
  async merge(repo: string, number: number, headSha: string): Promise<void> {
    await this.gh(['pr', 'merge', String(number), '-R', repo, '--squash', '--match-head-commit', headSha]);
  }

  async comment(repo: string, issue: number, body: string): Promise<void> {
    await this.gh(['issue', 'comment', String(issue), '-R', repo, '--body', body.slice(0, MAX_COMMENT)]);
  }

  async ensureLabel(repo: string, name: string): Promise<void> {
    await this.gh(['label', 'create', name, '-R', repo, '--force']);
  }

  async openIssue(repo: string, issue: { title: string; body: string; labels: string[] }): Promise<IssueRef> {
    const out = await this.gh([
      'issue',
      'create',
      '-R',
      repo,
      '--title',
      issue.title,
      '--body',
      issue.body,
      ...issue.labels.flatMap((l) => ['--label', l]),
    ]);
    const url = out.trim().split(/\s+/).pop() ?? '';
    const m = url.match(/\/issues\/(\d+)$/);
    if (!m) throw new GitHostError('gh issue create printed no issue url', 0, out.slice(0, 500));
    return { number: Number(m[1]), url };
  }

  async searchIssues(repo: string, query: string): Promise<IssueHit[]> {
    return this.json<IssueHit[]>([
      'issue',
      'list',
      '-R',
      repo,
      '--state',
      'all',
      '--search',
      query,
      '--limit',
      '100',
      '--json',
      'number,title,state,url',
    ]);
  }

  async closeIssue(repo: string, number: number): Promise<void> {
    await this.gh(['issue', 'close', String(number), '-R', repo]);
  }

  async editIssueBody(repo: string, number: number, body: string): Promise<void> {
    await this.gh(['issue', 'edit', String(number), '-R', repo, '--body', body]);
  }
}
