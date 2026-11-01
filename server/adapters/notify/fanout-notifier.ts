import type { Notice } from '../../../shared/domain/notice';
import type { Notifier } from '../../ports/notifier';

/** Calls each notifier in turn. One that fails does not stop the others, and `send` never rejects. */
export class FanoutNotifier implements Notifier {
  readonly #targets: readonly Notifier[];

  constructor(targets: readonly Notifier[]) {
    this.#targets = targets;
  }

  async send(notice: Notice): Promise<void> {
    for (const target of this.#targets) {
      try {
        await target.send(notice);
      } catch {
        // Go on with the next target.
      }
    }
  }
}
