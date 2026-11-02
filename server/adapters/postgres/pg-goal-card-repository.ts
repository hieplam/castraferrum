import type pg from 'pg';
import type { GoalCard, GoalCardDoor, GoalCardState } from '../../../shared/domain/goal-card';
import type { GoalCardRecord, GoalCardRepository, GoalCardUpdate, NewGoalCardRecord } from '../../ports/goal-card-repository';

function toCard(r: Record<string, unknown>): GoalCardRecord {
  return {
    id: r.id as string,
    repoId: r.repo_id as string,
    githubRepo: r.github_repo as string,
    issueNumber: r.issue_number as number,
    title: r.title as string,
    door: r.door as GoalCardDoor,
    card: r.card as GoalCard,
    state: r.state as GoalCardState,
    startAfter: (r.start_after as Date | null) ?? null,
    changed: r.changed as boolean,
    epicNumber: (r.epic_number as number | null) ?? null,
    prNumber: (r.pr_number as number | null) ?? null,
    loopId: (r.loop_id as string | null) ?? null,
    createdAt: r.created_at as Date,
    decidedAt: (r.decided_at as Date | null) ?? null,
  };
}

export class PgGoalCardRepository implements GoalCardRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async insert(c: NewGoalCardRecord): Promise<'inserted' | 'taken'> {
    // The unique indexes decide: goal_cards_one_proposed and goal_cards_one_per_issue.
    const res = await this.#pool.query(
      `INSERT INTO goal_cards (id, repo_id, github_repo, issue_number, title, door, card, start_after, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING`,
      [c.id, c.repoId, c.githubRepo, c.issueNumber, c.title, c.door, JSON.stringify(c.card), c.startAfter, c.createdAt],
    );
    return res.rowCount === 1 ? 'inserted' : 'taken';
  }

  async get(id: string): Promise<GoalCardRecord | null> {
    const { rows } = await this.#pool.query('SELECT * FROM goal_cards WHERE id = $1', [id]);
    return rows[0] ? toCard(rows[0]) : null;
  }

  async list(repoId: string | null): Promise<GoalCardRecord[]> {
    const { rows } = await this.#pool.query('SELECT * FROM goal_cards WHERE $1::uuid IS NULL OR repo_id = $1 ORDER BY created_at DESC, id DESC', [repoId]);
    return rows.map(toCard);
  }

  async update(id: string, from: GoalCardState, c: GoalCardUpdate): Promise<GoalCardRecord | null> {
    const { rows } = await this.#pool.query(
      `UPDATE goal_cards SET state = $3, title = $4, door = $5, card = $6, start_after = $7, changed = $8, decided_at = $9
       WHERE id = $1 AND state = $2
       RETURNING *`,
      [id, from, c.state, c.title, c.door, JSON.stringify(c.card), c.startAfter, c.changed, c.decidedAt],
    );
    return rows[0] ? toCard(rows[0]) : null;
  }
}
