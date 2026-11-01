import type { GoalRunRecord, StandingGoalRecord, StandingIssueRecord, StandingScheduleRecord } from '../../../shared/domain/standing-goal';
import type { GoalRepository, NewStandingIssueRecord } from '../../ports/goal-repository';
import { clone, cmp, type MemoryDb } from './memory-db';

export class MemoryGoalRepository implements GoalRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async getGoal(repo: string, rowId: string): Promise<StandingGoalRecord | null> {
    const row = this.#db.standingGoals.get(`${repo}\n${rowId}`);
    return row ? clone(row) : null;
  }

  async saveGoal(goal: StandingGoalRecord): Promise<void> {
    this.#db.writeStandingGoal(goal);
  }

  async findOpen(repo: string, fingerprint: string): Promise<StandingIssueRecord | null> {
    const row = this.#open().find((i) => i.repo === repo && i.fingerprint === fingerprint);
    return row ? clone(row) : null;
  }

  async listOpen(repo: string, rowId: string): Promise<StandingIssueRecord[]> {
    return this.#open()
      .filter((i) => i.repo === repo && i.rowId === rowId)
      .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime() || cmp(a.id, b.id))
      .map(clone);
  }

  async open(issue: NewStandingIssueRecord): Promise<StandingIssueRecord> {
    const row: StandingIssueRecord = { ...issue, lastFailedAt: issue.openedAt, failCount: 1, closedAt: null };
    this.#db.insertStandingIssue(row);
    return clone(row);
  }

  async touch(id: string, at: Date): Promise<StandingIssueRecord> {
    const old = this.#db.standingIssues.get(id);
    if (!old) throw new Error(`No standing issue ${id}`);
    const row = { ...old, lastFailedAt: new Date(at), failCount: old.failCount + 1 };
    this.#db.standingIssues.set(id, row);
    return clone(row);
  }

  async close(id: string, at: Date): Promise<void> {
    const old = this.#db.standingIssues.get(id);
    if (old && old.closedAt === null) this.#db.standingIssues.set(id, { ...old, closedAt: new Date(at) });
  }

  async getSchedule(repo: string): Promise<StandingScheduleRecord | null> {
    const row = this.#db.standingSchedules.get(repo);
    return row ? clone(row) : null;
  }

  async saveSchedule(schedule: StandingScheduleRecord): Promise<void> {
    this.#db.standingSchedules.set(schedule.repo, clone(schedule));
  }

  async saveRows(rows: GoalRunRecord[]): Promise<void> {
    for (const row of rows) this.#db.goalRuns.set(`${row.repo}\n${row.manifest}\n${row.rowId}`, clone(row));
  }

  async listRows(repo: string, manifest: string): Promise<GoalRunRecord[]> {
    return [...this.#db.goalRuns.values()]
      .filter((r) => r.repo === repo && r.manifest === manifest)
      .sort((a, b) => cmp(a.rowId, b.rowId))
      .map(clone);
  }

  #open(): StandingIssueRecord[] {
    return [...this.#db.standingIssues.values()].filter((i) => i.closedAt === null);
  }
}
