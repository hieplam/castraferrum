import { DomainError } from '../../../shared/domain/errors';
import type { LogLine, NewLogLine, RunLogRepository } from '../../ports/run-log-repository';
import { clone, type MemoryDb } from './memory-db';

export class MemoryRunLogRepository implements RunLogRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async append(runId: string, lines: NewLogLine[]): Promise<LogLine[]> {
    if (!this.#db.runs.has(runId)) throw new DomainError('RUN_NOT_FOUND', `No run ${runId}`);
    const existing = this.#db.logs.get(runId) ?? [];
    const start = existing.at(-1)?.seq ?? 0;
    const added = lines.map(
      (l, i): LogLine => ({ runId, seq: start + i + 1, at: l.at, level: l.level, message: l.message, data: clone(l.data ?? null) }),
    );
    this.#db.logs.set(runId, [...existing, ...added]);
    return added.map(clone);
  }

  async list(runId: string, afterSeq: number, limit: number): Promise<LogLine[]> {
    return (this.#db.logs.get(runId) ?? [])
      .filter((l) => l.seq > afterSeq)
      .slice(0, limit)
      .map(clone);
  }
}
