import type { Notice } from '../../shared/domain/notice';

export type NoticeRecord = Notice & {
  id: string;
  /** `null` = unread. */
  readAt: Date | null;
};

export type NewNoticeRecord = Notice & { id: string };

export interface NoticeRepository {
  /**
   * Stores an unread notice. At most one unread notice exists for each `dedupeKey`: a second one returns `null` and writes nothing.
   * A notice that was read does not count, so the same key can come back as a new unread row.
   */
  insertUnread(notice: NewNoticeRecord): Promise<NoticeRecord | null>;
  /** Unread notices, newest first (`at` descending, then `id`), at most `limit`. */
  listUnread(limit: number): Promise<NoticeRecord[]>;
  /** Marks the notice read at `at`. A notice that is already read keeps its first `readAt`. Throws `NOTICE_NOT_FOUND`. */
  markRead(id: string, at: Date): Promise<void>;
}
