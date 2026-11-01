import type { HoldRecord, HoldRepository, OpenHoldInput } from '../../ports/hold-repository';
import { clone, cmp, ConstraintViolation, type MemoryDb } from './memory-db';

export class MemoryHoldRepository implements HoldRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async open(input: OpenHoldInput): Promise<'opened' | 'kept'> {
    try {
      this.#db.writeHold({ ...input, checkedAt: null, closedAt: null, trialRunId: null });
      return 'opened';
    } catch (err) {
      if (err instanceof ConstraintViolation && err.constraint === 'resource_holds_one_open') return 'kept';
      throw err;
    }
  }

  async raiseUntil(resource: string, until: Date): Promise<void> {
    for (const row of this.#db.holds.values()) {
      if (row.resource !== resource || row.closedAt !== null) continue;
      if (row.until === null || row.until.getTime() < until.getTime()) this.#db.writeHold({ ...row, until });
    }
  }

  async listOpen(): Promise<HoldRecord[]> {
    return [...this.#db.holds.values()]
      .filter((h) => h.closedAt === null)
      .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime() || cmp(a.id, b.id))
      .map(clone);
  }

  async markChecked(id: string, at: Date, trialRunId: string | null): Promise<void> {
    const row = this.#db.holds.get(id);
    if (row) this.#db.writeHold({ ...row, checkedAt: at, trialRunId });
  }

  async close(id: string, at: Date): Promise<void> {
    const row = this.#db.holds.get(id);
    if (row && row.closedAt === null) this.#db.writeHold({ ...row, closedAt: at });
  }
}
