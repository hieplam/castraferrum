import { fingerprint, firstFailingLine } from '../../shared/domain/fingerprint';
import { parseHealthFile } from '../../shared/domain/health-goals';
import { nextRuns } from '../../shared/domain/schedule';
import type { CommandResult, CommandRunner } from '../ports/command-runner';
import type { GitHost } from '../ports/git-host';
import type { GoalRepository } from '../ports/goal-repository';
import type { IdGenerator } from '../ports/ids';
import type { HealthInput, StandingGoalService, StandingPassInput, StandingPassResult, StandingRow } from './contracts';

export type StandingGoalServiceDeps = {
  goals: GoalRepository;
  git: GitHost;
  runner: CommandRunner;
  ids: IdGenerator;
};

const DEFAULT_MAX_NEW_ISSUES = 3;
const LABEL = 'standing-goal';
const OUTPUT_LINES = 40;
/** Windows refuses a command line over about 32 000 characters, and `gh` gets the issue body as an argument. */
const MAX_OUTPUT_CHARS = 16_000;

type Pass = { repo: string; now: Date };

/** Runs the standing goals of a repository and keeps one GitHub issue for each distinct failure (spec 2.10, 2.11). */
export class DefaultStandingGoalService implements StandingGoalService {
  readonly #d: StandingGoalServiceDeps;

  constructor(deps: StandingGoalServiceDeps) {
    this.#d = deps;
  }

  async runPass({ repo, cwd, rows, maxNewIssues = DEFAULT_MAX_NEW_ISSUES, now }: StandingPassInput): Promise<StandingPassResult> {
    const result: StandingPassResult = { opened: 0, updated: 0, closed: 0, deferred: 0 };
    for (const row of rows) {
      const r = await this.#d.runner.run({ argv: row.run, cwd, timeoutMs: row.timeoutSec * 1000, windowsVerbatimArguments: row.verbatim });
      if (r.exitCode === 0) result.closed += await this.#passed({ repo, now }, row);
      else result[await this.#failed({ repo, now }, row, outputOf(r), result.opened < maxNewIssues)]++;
    }
    return result;
  }

  async runHealth({ repo, cwd, text, now, platform = process.platform }: HealthInput): Promise<StandingPassResult | null> {
    const file = parseHealthFile(text, repo, platform);
    if (!(await this.isDue(repo, now))) return null;
    // A throw from runPass skips markRan, so the next call tries again.
    const result = await this.runPass({ repo, cwd, rows: file.rows, maxNewIssues: file.maxNewIssuesPerPass, now });
    await this.markRan(repo, file.cron, file.timezone, now);
    return result;
  }

  async isDue(repo: string, now: Date): Promise<boolean> {
    const schedule = await this.#d.goals.getSchedule(repo);
    if (!schedule) return true;
    return schedule.nextAt !== null && schedule.nextAt <= now;
  }

  async markRan(repo: string, cron: string, timezone: string, now: Date): Promise<void> {
    await this.#d.goals.saveSchedule({ repo, lastAt: now, nextAt: nextRuns(cron, timezone, now, 1)[0] ?? null });
  }

  async #passed({ repo, now }: Pass, row: StandingRow): Promise<number> {
    const { goals, git } = this.#d;
    await goals.saveGoal({ repo, rowId: row.id, state: 'passing', lastLine: null, lastRunAt: now });
    const open = await goals.listOpen(repo, row.id);
    for (const issue of open) {
      await git.comment(repo, issue.issueNumber, `Passed at ${now.toISOString()}`);
      await git.closeIssue(repo, issue.issueNumber);
      await goals.close(issue.id, now);
    }
    return open.length;
  }

  async #failed(pass: Pass, row: StandingRow, output: string, mayOpen: boolean): Promise<'opened' | 'updated' | 'deferred'> {
    const { goals, git, ids } = this.#d;
    const { repo, now } = pass;
    const fp = fingerprint(repo, row.id, output);
    const failed = { repo, rowId: row.id, state: 'failing', lastLine: firstFailingLine(output), lastRunAt: now } as const;
    const body = (failCount: number) => issueBody(fp, row, now, failCount, output);

    const known = await goals.findOpen(repo, fp);
    if (known) {
      const { failCount } = await goals.touch(known.id, now);
      await git.editIssueBody(repo, known.issueNumber, body(failCount));
      await goals.saveGoal(failed);
      return 'updated';
    }

    const stored = { id: ids.newId(), repo, rowId: row.id, fingerprint: fp, openedAt: now };
    // The state of the hit matters: a closed issue is a regression that was fixed, so a new failure gets a new issue.
    const hit = (await git.searchIssues(repo, `"${fp}" in:body`)).find((h) => h.state === 'OPEN');
    if (hit) {
      await goals.open({ ...stored, issueNumber: hit.number });
      await git.editIssueBody(repo, hit.number, body(1));
      await goals.saveGoal(failed);
      return 'updated';
    }

    if (!mayOpen) return 'deferred';
    // `gh issue create --label` refuses a label that the repository does not have, and any repository can be a target.
    await git.ensureLabel(repo, LABEL);
    const issue = await git.openIssue(repo, { title: `standing goal ${row.id}: ${row.outcome}`, body: body(1), labels: [LABEL] });
    await goals.open({ ...stored, issueNumber: issue.number });
    await goals.saveGoal(failed);
    return 'opened';
  }
}

/** Stdout and stderr. A command that did not start has neither, so its error takes their place. */
function outputOf(r: CommandResult): string {
  return [r.stdout, r.stderr].filter((s) => s !== '').join('\n') || (r.error ?? '');
}

function issueBody(fp: string, row: StandingRow, at: Date, failCount: number, output: string): string {
  const tail = output.trimEnd().split(/\r?\n/).slice(-OUTPUT_LINES).join('\n').slice(-MAX_OUTPUT_CHARS);
  return [
    `<!-- fingerprint:${fp} -->`,
    row.outcome,
    '',
    `Last failed: ${at.toISOString()}`,
    `Failed passes: ${failCount}`,
    '',
    '```text',
    tail,
    '```',
  ].join('\n');
}
