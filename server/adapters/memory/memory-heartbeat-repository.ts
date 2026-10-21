import type { HeartbeatRepository } from '../../ports/heartbeat-repository';
import type { MemoryDb } from './memory-db';

export class MemoryHeartbeatRepository implements HeartbeatRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async beat(now: Date): Promise<void> {
    this.#db.heartbeat = new Date(now);
  }

  async last(): Promise<Date | null> {
    return this.#db.heartbeat ? new Date(this.#db.heartbeat) : null;
  }
}
