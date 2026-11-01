import type { Notice } from '../../shared/domain/notice';

/**
 * Tells the owner that a loop needs attention. `send` NEVER rejects: a failed push (a store error, a webhook that is down
 * or hangs) must not stop a loop, so every implementation catches its own errors.
 */
export interface Notifier {
  send(notice: Notice): Promise<void>;
}
