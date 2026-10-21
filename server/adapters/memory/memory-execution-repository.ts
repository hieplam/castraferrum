import { DomainError } from '../../../shared/domain/errors';
import type { ExecutionEndReason } from '../../../shared/domain/run';
import type {
  ExecutionRecord,
  ExecutionRepository,
  OpenExecutionInput,
  OpenResult,
} from '../../ports/execution-repository';
import type { Page, PageRequest } from '../../ports/page';
import { checkLimit, decodeExecutionCursor, encodeExecutionCursor } from '../cursor';
import { clone, ConstraintViolation, type MemoryDb } from './memory-db';

export class MemoryExecutionRepository implements ExecutionRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async open(input: OpenExecutionInput): Promise<OpenResult> {
    const db = this.#db;
    const loop = db.loops.get(input.loopId);
    if (!loop) throw new DomainError('LOOP_NOT_FOUND', `No loop ${input.loopId}`);
    if (loop.archivedAt !== null) {
      throw new DomainError('LOOP_ARCHIVED', `Loop ${input.loopId} is archived — restore it before Start`);
    }
    try {
      return db.transaction(() => {
        const seq = loop.executionCounter + 1;
        db.writeLoop({ ...loop, executionCounter: seq, status: 'active', nextRunAt: input.nextRunAt });
        const execution: ExecutionRecord = {
          id: input.id,
          loopId: input.loopId,
          seq,
          startedAt: input.now,
          endedAt: null,
          endReason: null,
        };
        db.writeExecution(execution, true); // an open execution already exists → executions_one_open_per_loop → rollback
        return { kind: 'opened', execution: clone(execution) } as const;
      });
    } catch (err) {
      if (err instanceof ConstraintViolation && err.constraint === 'executions_one_open_per_loop') {
        return { kind: 'already_active' };
      }
      throw err;
    }
  }

  async close(loopId: string, reason: ExecutionEndReason, endedAt: Date): Promise<ExecutionRecord | null> {
    const db = this.#db;
    const open = findOpen(db, loopId);
    if (!open) return null;
    return db.transaction(() => {
      const closed: ExecutionRecord = { ...open, endedAt, endReason: reason };
      db.writeExecution(closed, false);
      const loop = db.loops.get(loopId);
      if (loop) db.writeLoop({ ...loop, status: 'stopped', nextRunAt: null, updatedAt: endedAt });
      return clone(closed);
    });
  }

  async findOpen(loopId: string): Promise<ExecutionRecord | null> {
    const open = findOpen(this.#db, loopId);
    return open ? clone(open) : null;
  }

  async findById(id: string): Promise<ExecutionRecord | null> {
    const row = this.#db.executions.get(id);
    return row ? clone(row) : null;
  }

  async listByLoop(loopId: string, page: PageRequest): Promise<Page<ExecutionRecord>> {
    const limit = checkLimit(page.limit);
    const before = page.cursor ? decodeExecutionCursor(page.cursor) : null;
    const rows = [...this.#db.executions.values()]
      .filter((e) => e.loopId === loopId && (before === null || e.seq < before))
      .sort((a, b) => b.seq - a.seq);
    const items = rows.slice(0, limit).map(clone);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? encodeExecutionCursor(last.seq) : null };
  }

  async closeAllOpen(reason: 'server_down', endedAt: Date): Promise<number> {
    const db = this.#db;
    return db.transaction(() => {
      let n = 0;
      for (const e of db.executions.values()) {
        if (e.endedAt !== null) continue;
        db.writeExecution({ ...e, endedAt, endReason: reason }, false);
        n++;
      }
      return n;
    });
  }
}

function findOpen(db: MemoryDb, loopId: string): ExecutionRecord | undefined {
  for (const e of db.executions.values()) if (e.loopId === loopId && e.endedAt === null) return e;
  return undefined;
}
