import type { DomainEvent, EventFilter } from '../../shared/domain/events';

/** The service publishes events; it does not wait for listeners and never throws. */
export interface EventPublisher {
  publish(event: DomainEvent): void;
}

/**
 * Listens for events matching `filter` until `signal` aborts. Registration happens IMMEDIATELY when `subscribe` is called (not on the first iteration)
 * — `LiveService.runLogs` relies on that so no log line is missed between replay and follow.
 */
export interface EventSource {
  subscribe(filter: EventFilter, signal: AbortSignal): AsyncIterable<DomainEvent>;
}
