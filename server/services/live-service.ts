import { STATE_EVENT_TYPES, type DomainEvent, type EventFilter } from '../../shared/domain/events';
import { DomainError } from '../../shared/domain/errors';
import type { LogLine } from '../../shared/domain/run';
import type { EventSource } from '../ports/events';
import type { Repositories } from '../ports/repositories';
import type { LiveService } from './contracts';

export type LiveServiceDeps = Pick<Repositories, 'runs' | 'logs'> & { source: EventSource };

const LOG_PAGE = 1000;

/** Live events for SSE (ARCHITECTURE.md § Events to the UI). */
export class DefaultLiveService implements LiveService {
  readonly #d: LiveServiceDeps;

  constructor(deps: LiveServiceDeps) {
    this.#d = deps;
  }

  events(filter: EventFilter, signal: AbortSignal): AsyncIterable<DomainEvent> {
    return this.#d.source.subscribe({ ...filter, types: filter.types ?? STATE_EVENT_TYPES }, signal);
  }

  /**
   * Subscribe FIRST, replay the stored log after `afterSeq`, then push new lines; duplicates are dropped by `seq`. When the run
   * ends → drain the DB once (lines written between the replay and the listening are not missed) and finish.
   */
  async *runLogs(runId: string, afterSeq: number, signal: AbortSignal): AsyncGenerator<LogLine> {
    const d = this.#d;
    const own = new AbortController();
    const onAbort = () => own.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) own.abort();
    let last = afterSeq;
    async function* drain(): AsyncGenerator<LogLine> {
      for (;;) {
        const page = await d.logs.list(runId, last, LOG_PAGE);
        for (const line of page) {
          last = line.seq;
          yield line;
        }
        if (page.length < LOG_PAGE) return;
      }
    }
    try {
      const live = d.source.subscribe({ runId, types: ['run.log', 'run.finished'] }, own.signal);
      const run = await d.runs.findById(runId);
      if (!run) throw new DomainError('RUN_NOT_FOUND', `No run ${runId}`);
      yield* drain();
      if (run.status !== 'running') return;
      for await (const ev of live) {
        if (ev.type === 'run.finished') {
          yield* drain();
          return;
        }
        if (ev.type !== 'run.log' || ev.line.seq <= last) continue;
        if (ev.line.seq > last + 1) yield* drain(); // missed a line (seq jumped) → read the DB to stay contiguous
        else {
          last = ev.line.seq;
          yield ev.line;
        }
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      own.abort();
    }
  }
}
