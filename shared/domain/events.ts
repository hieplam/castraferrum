// Domain events that services emit on the bus (ARCHITECTURE.md, events to the UI). They carry only an id and a few fields so
// the UI knows what changed and reloads through the API - never the whole record.
import type { ExecutionEndReason, LogLine, RunStatus } from './run';

export type DomainEvent =
  | { type: 'loop.created'; at: Date; loopId: string }
  | { type: 'loop.updated'; at: Date; loopId: string }
  | { type: 'execution.started'; at: Date; loopId: string; executionId: string; seq: number }
  | { type: 'execution.ended'; at: Date; loopId: string; executionId: string; reason: ExecutionEndReason }
  | { type: 'run.started'; at: Date; loopId: string; executionId: string; runId: string; iteration: number }
  | { type: 'run.finished'; at: Date; loopId: string; executionId: string; runId: string; status: RunStatus }
  | { type: 'run.skipped'; at: Date; loopId: string; executionId: string; runId: string; reason: string }
  /** Live log - only `LiveService.runLogs` uses it; `/api/events` does not emit this kind. */
  | { type: 'run.log'; at: Date; loopId: string; runId: string; line: LogLine };

export type DomainEventType = DomainEvent['type'];

/** Every kind except `run.log` - the default of `/api/events`. */
export const STATE_EVENT_TYPES: readonly DomainEventType[] = [
  'loop.created',
  'loop.updated',
  'execution.started',
  'execution.ended',
  'run.started',
  'run.finished',
  'run.skipped',
];

/** Event filter: empty = no filtering on that field. */
export type EventFilter = { types?: readonly DomainEventType[]; loopId?: string; runId?: string };

export function matchesFilter(event: DomainEvent, filter: EventFilter): boolean {
  if (filter.types && !filter.types.includes(event.type)) return false;
  if (filter.loopId !== undefined && event.loopId !== filter.loopId) return false;
  if (filter.runId !== undefined && (!('runId' in event) || event.runId !== filter.runId)) return false;
  return true;
}
