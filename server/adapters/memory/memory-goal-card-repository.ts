import type { GoalCardState } from '../../../shared/domain/goal-card';
import type { GoalCardRecord, GoalCardRepository, GoalCardUpdate, NewGoalCardRecord } from '../../ports/goal-card-repository';
import { clone, cmp, ConstraintViolation, type MemoryDb } from './memory-db';

export class MemoryGoalCardRepository implements GoalCardRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async insert(card: NewGoalCardRecord): Promise<'inserted' | 'taken'> {
    try {
      this.#db.writeGoalCard({ ...card, state: 'proposed', changed: false, epicNumber: null, prNumber: null, loopId: null, decidedAt: null });
      return 'inserted';
    } catch (err) {
      if (err instanceof ConstraintViolation && err.kind === 'unique') return 'taken';
      throw err;
    }
  }

  async get(id: string): Promise<GoalCardRecord | null> {
    const row = this.#db.goalCards.get(id);
    return row ? clone(row) : null;
  }

  async list(repoId: string | null): Promise<GoalCardRecord[]> {
    return [...this.#db.goalCards.values()]
      .filter((c) => repoId === null || c.repoId === repoId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || cmp(b.id, a.id))
      .map(clone);
  }

  async update(id: string, from: GoalCardState, change: GoalCardUpdate): Promise<GoalCardRecord | null> {
    const row = this.#db.goalCards.get(id);
    if (!row || row.state !== from) return null;
    const next = { ...row, ...change };
    this.#db.writeGoalCard(next);
    return clone(next);
  }
}
