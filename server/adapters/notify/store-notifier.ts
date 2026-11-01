import type { Notice } from '../../../shared/domain/notice';
import type { IdGenerator } from '../../ports/ids';
import type { NoticeRepository } from '../../ports/notice-repository';
import type { Notifier } from '../../ports/notifier';

/**
 * Writes the notice to the `notices` table. It passes the notice on to `onNew` ONLY when the table took it as a new unread
 * row, so one cause gives one push, however many times the cause is sent. It never rejects: a store error is swallowed.
 */
export class StoreNotifier implements Notifier {
  readonly #notices: NoticeRepository;
  readonly #ids: IdGenerator;
  readonly #onNew: Notifier | undefined;

  constructor(deps: { notices: NoticeRepository; ids: IdGenerator; onNew?: Notifier }) {
    this.#notices = deps.notices;
    this.#ids = deps.ids;
    this.#onNew = deps.onNew;
  }

  async send(notice: Notice): Promise<void> {
    try {
      const stored = await this.#notices.insertUnread({ ...notice, id: this.#ids.newId() });
      if (stored) await this.#onNew?.send(notice);
    } catch {
      // A failed notice must not stop a loop.
    }
  }
}
