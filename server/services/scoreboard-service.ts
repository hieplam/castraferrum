import { DomainError } from '../../shared/domain/errors';
import { isValidTimeZone, nextRuns } from '../../shared/domain/schedule';
import type { Clock } from '../ports/clock';
import type { CommandRunner } from '../ports/command-runner';
import type { GateRepository } from '../ports/gate-repository';
import type { RepoRepository } from '../ports/repo-repository';
import type { ReviewCluster, ReviewReports } from '../ports/review-reports';
import type { RunRepository } from '../ports/run-repository';
import type { Scoreboard, ScoreboardCause, ScoreboardService } from './contracts';

export type ScoreboardServiceDeps = {
  repos: RepoRepository;
  runs: RunRepository;
  gate: GateRepository;
  reports: ReviewReports;
  commands: CommandRunner;
  clock: Clock;
};

const DAY_MS = 86_400_000;
const WEEKS = 5;
const FIGURE_DAYS = 30;
const GIT_TIMEOUT_MS = 10_000;

/** A cause: the clusters of every report that share one fingerprint. The newest report names the cause and its check. */
type Merged = { fingerprint: string; cause: string; ids: Set<string>; checkName: string | null; repoPath: string };

/** The process scoreboard (spec 2.12, goal G15): how often a known cause repeats before and after the date its check was merged. */
export class DefaultScoreboardService implements ScoreboardService {
  readonly #d: ScoreboardServiceDeps;

  constructor(deps: ScoreboardServiceDeps) {
    this.#d = deps;
  }

  async scoreboard(tz: string): Promise<Scoreboard> {
    if (!isValidTimeZone(tz)) {
      const message = `Invalid time zone "${tz}"`;
      throw new DomainError('VALIDATION_FAILED', message, { issues: [{ field: 'tz', code: 'invalid', message }] });
    }
    const now = this.#d.clock.now();
    const repos = await this.#d.repos.list();
    const merged = mergeByFingerprint(await this.#d.reports.read(repos.map((r) => r.path)));
    const dates = await this.#dateIds(merged, now);

    const causes: (ScoreboardCause & { dated: Date[] })[] = [];
    for (const m of merged) {
      const dated = [...m.ids].map((id) => dates.get(id)).filter((d): d is Date => d !== undefined);
      const checkName = isPlainName(m.checkName) ? m.checkName : null;
      const checkMergedAt = checkName === null ? null : await this.#checkMergedAt(m.repoPath, checkName);
      const before = checkMergedAt === null ? 0 : dated.filter((d) => d.getTime() < checkMergedAt.getTime()).length;
      const after = checkMergedAt === null ? 0 : dated.length - before;
      causes.push({ fingerprint: m.fingerprint, cause: m.cause, checkName, checkMergedAt, before, after, repeats: dated.length, dated });
    }
    causes.sort((a, b) => b.repeats - a.repeats || (a.cause < b.cause ? -1 : a.cause > b.cause ? 1 : 0));

    const since = now.getTime() - FIGURE_DAYS * DAY_MS;
    const withCheck = causes.filter((c) => c.checkMergedAt !== null);
    return {
      figures: {
        causes: causes.filter((c) => c.dated.some((d) => d.getTime() >= since && d.getTime() <= now.getTime())).length,
        checks: withCheck.length,
        before: withCheck.reduce((n, c) => n + c.before, 0),
        after: withCheck.reduce((n, c) => n + c.after, 0),
      },
      weeks: weeksOf(now, tz, causes.flatMap((c) => c.dated)),
      causes: causes.map(({ dated: _dated, ...c }) => c),
    };
  }

  /**
   * The date of each id: a run id gives `started_at` of the run, `gate:<id>` gives `finished_at` of the job. A `comment:` id has no date,
   * and neither has an id that no run or job holds.
   */
  async #dateIds(merged: Merged[], now: Date): Promise<Map<string, Date>> {
    const dates = new Map<string, Date>();
    if (merged.every((m) => m.ids.size === 0)) return dates;
    const from = new Date(0);
    const to = new Date(now.getTime() + DAY_MS);
    const wanted = new Set(merged.flatMap((m) => [...m.ids]));
    for (const run of await this.#d.runs.listBetween(from, to)) if (wanted.has(run.id)) dates.set(run.id, run.startedAt);
    for (const job of await this.#d.gate.listRefusedBetween(from, to)) {
      const id = `gate:${job.id}`;
      if (wanted.has(id) && job.finishedAt !== null) dates.set(id, job.finishedAt);
    }
    return dates;
  }

  /** The oldest commit that added the file of the check, or `null`: no commit, or a git failure. */
  async #checkMergedAt(repoPath: string, name: string): Promise<Date | null> {
    const res = await this.#d.commands.run({
      argv: ['git', 'log', '--diff-filter=A', '--format=%cI', '--', name],
      cwd: repoPath,
      timeoutMs: GIT_TIMEOUT_MS,
    });
    if (res.exitCode !== 0) return null;
    const times = res.stdout
      .split(/\r?\n/)
      .map((l) => new Date(l.trim()))
      .filter((d) => !Number.isNaN(d.getTime()));
    return times.length === 0 ? null : new Date(Math.min(...times.map((d) => d.getTime())));
  }
}

/** A check name that git can take as a path: it starts with no `-` (an option) and holds no `..` (a path out of the repo). */
function isPlainName(name: string | null): name is string {
  return name !== null && !name.startsWith('-') && !name.includes('..');
}

/** One cause per fingerprint, with the union of the ids. Clusters come oldest file first, so a later one wins the name and the check. */
function mergeByFingerprint(clusters: ReviewCluster[]): Merged[] {
  const byFingerprint = new Map<string, Merged>();
  for (const c of clusters) {
    const m = byFingerprint.get(c.fingerprint);
    if (!m) {
      byFingerprint.set(c.fingerprint, { fingerprint: c.fingerprint, cause: c.cause, ids: new Set(c.runIds), checkName: c.checkName, repoPath: c.repoPath });
      continue;
    }
    for (const id of c.runIds) m.ids.add(id);
    m.cause = c.cause;
    if (c.checkName !== null) {
      m.checkName = c.checkName;
      m.repoPath = c.repoPath;
    }
  }
  return [...byFingerprint.values()];
}

/** 00:00 on the Monday of the week that holds `at`, in `tz`. */
function startOfWeek(at: Date, tz: string): Date {
  const marks = nextRuns('0 0 * * 1', tz, new Date(at.getTime() - 8 * DAY_MS), 3).filter((d) => d <= at);
  const last = marks.at(-1);
  if (!last) throw new Error(`Could not find the Monday of ${at.toISOString()} in ${tz}`);
  return last;
}

/** The `WEEKS` weeks that end with the week of `now`, oldest first, each with the number of dated ids that fall in it. */
function weeksOf(now: Date, tz: string, ids: Date[]): { from: Date; repeats: number }[] {
  const starts: Date[] = [startOfWeek(now, tz)];
  while (starts.length < WEEKS) starts.unshift(startOfWeek(new Date(starts[0]!.getTime() - 3 * DAY_MS), tz));
  const end = startOfWeek(new Date(starts.at(-1)!.getTime() + 10 * DAY_MS), tz);
  return starts.map((from, i) => {
    const to = starts[i + 1] ?? end;
    return { from, repeats: ids.filter((d) => d.getTime() >= from.getTime() && d.getTime() < to.getTime()).length };
  });
}
