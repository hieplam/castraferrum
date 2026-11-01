import type pg from 'pg';
import { DomainError } from '../../../shared/domain/errors';
import type { NoticeKind, NoticeMessageKey } from '../../../shared/domain/notice';
import type { NewNoticeRecord, NoticeRecord, NoticeRepository } from '../../ports/notice-repository';

function toNotice(r: Record<string, unknown>): NoticeRecord {
  return {
    id: r.id as string,
    dedupeKey: r.dedupe_key as string,
    kind: r.kind as NoticeKind,
    loopId: (r.loop_id as string | null) ?? null,
    messageKey: r.message_key as NoticeMessageKey,
    params: r.params as Record<string, string>,
    at: r.at as Date,
    readAt: (r.read_at as Date | null) ?? null,
  };
}

export class PgNoticeRepository implements NoticeRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async insertUnread(n: NewNoticeRecord): Promise<NoticeRecord | null> {
    // The partial unique index notices_one_unread_per_key decides: a second unread row for the key writes nothing.
    const { rows } = await this.#pool.query(
      `INSERT INTO notices (id, dedupe_key, kind, loop_id, message_key, params, at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (dedupe_key) WHERE read_at IS NULL DO NOTHING
       RETURNING *`,
      [n.id, n.dedupeKey, n.kind, n.loopId, n.messageKey, JSON.stringify(n.params), n.at],
    );
    return rows[0] ? toNotice(rows[0]) : null;
  }

  async listUnread(limit: number): Promise<NoticeRecord[]> {
    const { rows } = await this.#pool.query('SELECT * FROM notices WHERE read_at IS NULL ORDER BY at DESC, id DESC LIMIT $1', [limit]);
    return rows.map(toNotice);
  }

  async markRead(id: string, at: Date): Promise<void> {
    const res = await this.#pool.query('UPDATE notices SET read_at = coalesce(read_at, $2) WHERE id = $1', [id, at]);
    if (res.rowCount === 0) throw new DomainError('NOTICE_NOT_FOUND', `No notice ${id}`);
  }
}
