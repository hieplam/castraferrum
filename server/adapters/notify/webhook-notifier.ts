import { noticeText, type Notice } from '../../../shared/domain/notice';
import type { Notifier } from '../../ports/notifier';

/** A webhook that does not answer in this time is given up. */
export const WEBHOOK_TIMEOUT_MS = 5000;

/**
 * Posts `{ kind, text, at }` as JSON to one URL (`LOOPS_NOTIFY_WEBHOOK`). `text` is the English text of the notice. It never
 * rejects: a refused connection, a non-2xx answer or a time-out is dropped, because a failed push must not stop a loop.
 */
export class WebhookNotifier implements Notifier {
  readonly #url: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(url: string, opts: { timeoutMs?: number; fetch?: typeof fetch } = {}) {
    this.#url = url;
    this.#timeoutMs = opts.timeoutMs ?? WEBHOOK_TIMEOUT_MS;
    this.#fetch = opts.fetch ?? fetch;
  }

  async send(notice: Notice): Promise<void> {
    try {
      const res = await this.#fetch(this.#url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: notice.kind, text: noticeText(notice.messageKey, notice.params), at: notice.at.toISOString() }),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      // Free the connection; the body is of no use.
      await res.body?.cancel().catch(() => {});
    } catch {
      // Dropped on purpose (see above).
    }
  }
}
