import { DomainError } from '../../../shared/domain/errors';
import type { NewNoticeRecord, NoticeRecord, NoticeRepository } from '../../ports/notice-repository';
import { clone, cmp, ConstraintViolation, type MemoryDb } from './memory-db';

export class MemoryNoticeRepository implements NoticeRepository {
  readonly #db: MemoryDb;

  constructor(db: MemoryDb) {
    this.#db = db;
  }

  async insertUnread(n: NewNoticeRecord): Promise<NoticeRecord | null> {
    try {
      this.#db.insertNotice({ ...clone(n), readAt: null });
    } catch (err) {
      if (err instanceof ConstraintViolation && err.constraint === 'notices_one_unread_per_key') return null;
      throw err;
    }
    return clone(this.#db.notices.get(n.id)!);
  }

  async listUnread(limit: number): Promise<NoticeRecord[]> {
    return [...this.#db.notices.values()]
      .filter((x) => x.readAt === null)
      .sort((a, b) => b.at.getTime() - a.at.getTime() || cmp(b.id, a.id))
      .slice(0, limit)
      .map(clone);
  }

  async markRead(id: string, at: Date): Promise<void> {
    const row = this.#db.notices.get(id);
    if (!row) throw new DomainError('NOTICE_NOT_FOUND', `No notice ${id}`);
    row.readAt ??= at;
  }
}
