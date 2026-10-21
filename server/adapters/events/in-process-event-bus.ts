import { matchesFilter, type DomainEvent, type EventFilter } from '../../../shared/domain/events';
import type { EventPublisher, EventSource } from '../../ports/events';

/**
 * In-process bus — both EventPublisher and EventSource (one process is enough; if split across processes, swap in
 * Postgres LISTEN/NOTIFY and the service stays unchanged). Each listener has its own queue: `publish` never waits for anyone.
 */
export class InProcessEventBus implements EventPublisher, EventSource {
  readonly #subs = new Set<Subscription>();

  publish(event: DomainEvent): void {
    for (const s of this.#subs) s.push(event);
  }

  subscribe(filter: EventFilter, signal: AbortSignal): AsyncIterable<DomainEvent> {
    // Register RIGHT HERE (do not wait for the first iteration) — see the EventSource contract.
    const onAbort = () => sub.close();
    const sub = new Subscription(filter, () => {
      this.#subs.delete(sub);
      signal.removeEventListener('abort', onAbort);
    });
    if (signal.aborted) sub.close();
    else {
      this.#subs.add(sub);
      signal.addEventListener('abort', onAbort, { once: true });
    }
    return sub;
  }

  /** Number of current listeners — for observation / tests (aborting the signal must unregister). */
  listenerCount(): number {
    return this.#subs.size;
  }
}

class Subscription implements AsyncIterableIterator<DomainEvent> {
  readonly #filter: EventFilter;
  readonly #onClose: () => void;
  readonly #queue: DomainEvent[] = [];
  #waiter: ((r: IteratorResult<DomainEvent>) => void) | null = null;
  #closed = false;

  constructor(filter: EventFilter, onClose: () => void) {
    this.#filter = filter;
    this.#onClose = onClose;
  }

  push(event: DomainEvent): void {
    if (this.#closed || !matchesFilter(event, this.#filter)) return;
    if (this.#waiter) {
      const w = this.#waiter;
      this.#waiter = null;
      w({ value: event, done: false });
    } else this.#queue.push(event);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#queue.length = 0;
    this.#onClose();
    if (this.#waiter) {
      const w = this.#waiter;
      this.#waiter = null;
      w({ value: undefined, done: true });
    }
  }

  next(): Promise<IteratorResult<DomainEvent>> {
    const head = this.#queue.shift();
    if (head) return Promise.resolve({ value: head, done: false });
    if (this.#closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => {
      this.#waiter = resolve;
    });
  }

  return(): Promise<IteratorResult<DomainEvent>> {
    this.close();
    return Promise.resolve({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<DomainEvent> {
    return this;
  }
}
