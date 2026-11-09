import type pg from 'pg';
import type { GoalCadence, GoalRunRecord, StandingGoalRecord, StandingGoalState, StandingIssueRecord, StandingScheduleRecord } from '../../../shared/domain/standing-goal';
import type { GoalManifestRun, GoalRepository, NewStandingIssueRecord, StandingGoalEntry } from '../../ports/goal-repository';
import { withTx } from './pg-util';

type Row = Record<string, unknown>;

function toGoal(r: Row): StandingGoalRecord {
  return {
    repo: r.repo as string,
    rowId: r.row_id as string,
    state: r.state as StandingGoalState,
    lastLine: (r.last_line as string | null) ?? null,
    lastRunAt: r.last_run_at as Date,
  };
}

function toIssue(r: Row): StandingIssueRecord {
  return {
    id: r.id as string,
    repo: r.repo as string,
    rowId: r.row_id as string,
    fingerprint: r.fingerprint as string,
    issueNumber: r.issue_number as number,
    openedAt: r.opened_at as Date,
    lastFailedAt: r.last_failed_at as Date,
    failCount: r.fail_count as number,
    closedAt: (r.closed_at as Date | null) ?? null,
  };
}

function toSchedule(r: Row): StandingScheduleRecord {
  return { repo: r.repo as string, lastAt: r.last_at as Date, nextAt: (r.next_at as Date | null) ?? null };
}

function toRun(r: Row): GoalRunRecord {
  return {
    repo: r.repo as string,
    manifest: r.manifest as string,
    rowId: r.row_id as string,
    pass: r.pass as boolean,
    value: (r.value as number | null) ?? null,
    of: (r.of as number | null) ?? null,
    line: r.line as string,
    cadence: r.cadence as GoalCadence,
    sha: r.sha as string,
    at: r.at as Date,
  };
}

export class PgGoalRepository implements GoalRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async getGoal(repo: string, rowId: string): Promise<StandingGoalRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM standing_goals WHERE repo = $1 AND row_id = $2', [repo, rowId]);
    return rows[0] ? toGoal(rows[0]) : null;
  }

  async saveGoal(g: StandingGoalRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO standing_goals (repo, row_id, state, last_line, last_run_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (repo, row_id) DO UPDATE SET state = EXCLUDED.state, last_line = EXCLUDED.last_line, last_run_at = EXCLUDED.last_run_at`,
      [g.repo, g.rowId, g.state, g.lastLine, g.lastRunAt],
    );
  }

  async findOpen(repo: string, fingerprint: string): Promise<StandingIssueRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM standing_issues WHERE repo = $1 AND fingerprint = $2 AND closed_at IS NULL', [
      repo,
      fingerprint,
    ]);
    return rows[0] ? toIssue(rows[0]) : null;
  }

  async listOpen(repo: string, rowId: string): Promise<StandingIssueRecord[]> {
    const { rows } = await this.#pool.query(
      'SELECT * FROM standing_issues WHERE repo = $1 AND row_id = $2 AND closed_at IS NULL ORDER BY opened_at, id',
      [repo, rowId],
    );
    return rows.map(toIssue);
  }

  async open(i: NewStandingIssueRecord): Promise<StandingIssueRecord> {
    const { rows } = await this.#pool.query(
      `INSERT INTO standing_issues (id, repo, row_id, fingerprint, issue_number, opened_at, last_failed_at, fail_count)
       VALUES ($1, $2, $3, $4, $5, $6, $6, 1) RETURNING *`,
      [i.id, i.repo, i.rowId, i.fingerprint, i.issueNumber, i.openedAt],
    );
    return toIssue(rows[0]);
  }

  async touch(id: string, at: Date): Promise<StandingIssueRecord> {
    const { rows } = await this.#pool.query(
      'UPDATE standing_issues SET last_failed_at = $2, fail_count = fail_count + 1 WHERE id = $1 RETURNING *',
      [id, at],
    );
    if (!rows[0]) throw new Error(`No standing issue ${id}`);
    return toIssue(rows[0]);
  }

  async close(id: string, at: Date): Promise<void> {
    await this.#pool.query('UPDATE standing_issues SET closed_at = $2 WHERE id = $1 AND closed_at IS NULL', [id, at]);
  }

  async getSchedule(repo: string): Promise<StandingScheduleRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM standing_schedule WHERE repo = $1', [repo]);
    return rows[0] ? toSchedule(rows[0]) : null;
  }

  async saveSchedule(s: StandingScheduleRecord): Promise<void> {
    await this.#pool.query(
      `INSERT INTO standing_schedule (repo, last_at, next_at) VALUES ($1, $2, $3)
       ON CONFLICT (repo) DO UPDATE SET last_at = EXCLUDED.last_at, next_at = EXCLUDED.next_at`,
      [s.repo, s.lastAt, s.nextAt],
    );
  }

  async saveRows(rows: GoalRunRecord[]): Promise<void> {
    await withTx(this.#pool, async (c) => {
      for (const r of rows) {
        await c.query(
          `INSERT INTO goal_runs (repo, manifest, row_id, pass, value, "of", line, cadence, sha, at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (repo, manifest, row_id) DO UPDATE SET pass = EXCLUDED.pass, value = EXCLUDED.value, "of" = EXCLUDED."of", line = EXCLUDED.line,
             cadence = EXCLUDED.cadence, sha = EXCLUDED.sha, at = EXCLUDED.at`,
          [r.repo, r.manifest, r.rowId, r.pass, r.value, r.of, r.line, r.cadence, r.sha, r.at],
        );
      }
    });
  }

  async listRows(repo: string, manifest: string): Promise<GoalRunRecord[]> {
    const { rows } = await this.#pool.query('SELECT * FROM goal_runs WHERE repo = $1 AND manifest = $2 ORDER BY row_id COLLATE "C"', [repo, manifest]);
    return rows.map(toRun);
  }

  async listManifests(repo: string): Promise<GoalManifestRun[]> {
    // The newest row of each manifest; a tie takes the smaller row id, as the memory adapter does.
    const { rows } = await this.#pool.query(
      `SELECT DISTINCT ON (manifest) manifest, at, sha FROM goal_runs WHERE repo = $1 ORDER BY manifest, at DESC, row_id COLLATE "C"`,
      [repo],
    );
    return rows
      .map((r) => ({ manifest: r.manifest as string, at: r.at as Date, sha: r.sha as string }))
      .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.manifest < b.manifest ? -1 : a.manifest > b.manifest ? 1 : 0));
  }

  async listGoals(repo: string): Promise<StandingGoalEntry[]> {
    const goals = await this.#pool.query('SELECT * FROM standing_goals WHERE repo = $1 ORDER BY row_id COLLATE "C"', [repo]);
    const issues = await this.#pool.query('SELECT * FROM standing_issues WHERE repo = $1 ORDER BY opened_at, id', [repo]);
    return goals.rows.map((g) => ({ ...toGoal(g), issues: issues.rows.filter((i) => i.row_id === g.row_id).map(toIssue) }));
  }
}
