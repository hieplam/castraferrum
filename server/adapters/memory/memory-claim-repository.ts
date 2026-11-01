import type { ClaimRecord, ClaimRepository, OpenClaimInput, OrphanedClaim } from '../../ports/claims';
import { clone, cmp, ConstraintViolation, type MemoryDb } from './memory-db';

const LIVE_RUN: readonly string[] = ['running', 'held'];

const oldestFirst = (a: ClaimRecord, b: ClaimRecord) => a.openedAt.getTime() - b.openedAt.getTime() || cmp(a.id, b.id);

export class MemoryClaimRepository implements ClaimRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async open(input: OpenClaimInput): Promise<'opened' | 'taken'> {
    const { at, ...rest } = input;
    try {
      this.#db.writeClaim({ ...rest, openedAt: at, closedAt: null, closeReason: null, owner: 'run', gateJobId: null });
      return 'opened';
    } catch (err) {
      if (err instanceof ConstraintViolation && err.constraint === 'run_claims_one_open_per_task') return 'taken';
      throw err;
    }
  }

  async listOpen(loopId: string): Promise<ClaimRecord[]> {
    return [...this.#db.claims.values()]
      .filter((c) => c.loopId === loopId && c.closedAt === null)
      .sort(oldestFirst)
      .map(clone);
  }

  async close(id: string, reason: string, at: Date): Promise<void> {
    const row = this.#db.claims.get(id);
    if (row && row.closedAt === null) this.#db.writeClaim({ ...row, closedAt: at, closeReason: reason });
  }

  async handOver(id: string, gateJobId: string): Promise<boolean> {
    const row = this.#db.claims.get(id);
    if (!row || row.closedAt !== null) return false;
    this.#db.writeClaim({ ...row, owner: 'gate', gateJobId });
    return true;
  }

  async listGateOwned(): Promise<ClaimRecord[]> {
    return [...this.#db.claims.values()]
      .filter((c) => c.closedAt === null && c.gateJobId !== null)
      .sort(oldestFirst)
      .map(clone);
  }

  async findOrphaned(limit: number): Promise<OrphanedClaim[]> {
    const out: OrphanedClaim[] = [];
    for (const c of [...this.#db.claims.values()].filter((row) => row.closedAt === null && row.owner === 'run').sort(oldestFirst)) {
      const run = this.#db.runs.get(c.runId);
      if (run && LIVE_RUN.includes(run.status)) continue;
      out.push({ ...clone(c), runStatus: run?.status ?? null, endResult: run?.endResult ?? null });
    }
    return out.slice(0, limit);
  }
}
