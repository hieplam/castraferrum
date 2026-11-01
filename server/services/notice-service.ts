import { NOTICE_LIST_LIMIT } from '../../shared/domain/notice';
import type { Clock } from '../ports/clock';
import type { NoticeRecord } from '../ports/notice-repository';
import type { Repositories } from '../ports/repositories';
import type { NoticeService } from './contracts';

export type NoticeServiceDeps = Pick<Repositories, 'notices'> & { clock: Clock };

/** Reads the unread notices and marks them read. Writing a notice is the job of the `Notifier` port, not of this service. */
export class DefaultNoticeService implements NoticeService {
  readonly #d: NoticeServiceDeps;

  constructor(deps: NoticeServiceDeps) {
    this.#d = deps;
  }

  listUnread(): Promise<NoticeRecord[]> {
    return this.#d.notices.listUnread(NOTICE_LIST_LIMIT);
  }

  markRead(id: string): Promise<void> {
    return this.#d.notices.markRead(id, this.#d.clock.now());
  }
}
