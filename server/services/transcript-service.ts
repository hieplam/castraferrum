import { DomainError } from '../../shared/domain/errors';
import { DEFAULT_TRANSCRIPT_PAGE } from '../../shared/domain/transcript';
import type { EventSource } from '../ports/events';
import type { Repositories } from '../ports/repositories';
import type { RunRecord } from '../ports/run-repository';
import type { TranscriptPageOptions, TranscriptRef, TranscriptSource } from '../ports/transcript-source';
import type { TranscriptEvent, TranscriptPage, TranscriptService } from './contracts';

export type TranscriptServiceDeps = Pick<Repositories, 'runs'> & {
  source: TranscriptSource;
  events: EventSource;
  /** Page size (default 50 entries / 4 MB — SPEC § Transcript). */
  page?: TranscriptPageOptions;
  /** How long to wait after `run.finished` before draining the file one last time (Claude writes the file 0.1–0.7 s late). Defaults to 1 000 ms. */
  settleMs?: number;
  /** A running run without a file yet: look again after this interval. Defaults to 500 ms. */
  relocateMs?: number;
};

const FINISHED: unique symbol = Symbol('finished');

/**
 * The transcript of one run (SPEC-phase-2 § Transcript — Service + API): read through the `TranscriptSource` port, never
 * touches `node:fs`, stores nothing. Each `follow` is its own stream — no locking, no reference counting (project owner: "open 2 tabs
 * and both show it"); `followers()` exists only so tests can prove that closed streams bring the count back to 0.
 */
export class DefaultTranscriptService implements TranscriptService {
  readonly #d: TranscriptServiceDeps;
  readonly #page: TranscriptPageOptions;
  #followers = 0;

  constructor(deps: TranscriptServiceDeps) {
    this.#d = deps;
    this.#page = deps.page ?? DEFAULT_TRANSCRIPT_PAGE;
  }

  /** Number of `follow` streams currently open. */
  followers(): number {
    return this.#followers;
  }

  async page(runId: string, before: number | null): Promise<TranscriptPage> {
    const run = await this.#run(runId);
    const ref = run.sessionId ? await this.#d.source.locate(run.sessionId) : null;
    if (!ref) {
      throw new DomainError(
        'TRANSCRIPT_NOT_FOUND',
        run.sessionId ? `Transcript file of session ${run.sessionId} not found` : `Run ${runId} has no session`,
        { sessionId: run.sessionId },
      );
    }
    return this.#d.source.readBack(ref, before, this.#page);
  }

  /**
   * Subscribe to `run.finished` BEFORE reading (like `runLogs`) → find the file (not there yet: `missing`, a running run looks again) →
   * `snapshot` (or follow from `after` when resuming) → follow the file until the run ends → wait `settleMs` → drain the file one last time
   * → `ended`.
   */
  async *follow(runId: string, after: number | null, signal: AbortSignal): AsyncGenerator<TranscriptEvent> {
    const d = this.#d;
    const own = new AbortController();
    const onAbort = () => own.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) own.abort();
    this.#followers++;
    try {
      const sub = d.events.subscribe({ runId, types: ['run.finished'] }, own.signal);
      let finished = false;
      const finishedP = (async () => {
        for await (const _ of sub) {
          finished = true;
          return;
        }
      })();
      let run = await this.#run(runId);

      // 1. Find the file. A running run may not have a session yet / Claude may not have created the file → look again every relocateMs.
      let ref: TranscriptRef | null = null;
      let missingSent = false;
      for (;;) {
        if (run.sessionId) ref = await d.source.locate(run.sessionId);
        if (ref || own.signal.aborted) break;
        if (!missingSent) {
          missingSent = true;
          yield { type: 'missing' };
        }
        if (run.status !== 'running') {
          yield { type: 'ended', status: run.status };
          return;
        }
        await Promise.race([sleep(d.relocateMs ?? 500, own.signal), finishedP]);
        if (finished) await sleep(d.settleMs ?? 1000, own.signal); // the file may appear right after the run finishes
        if (own.signal.aborted) return;
        run = await this.#run(runId);
      }
      if (!ref) return;

      // 2. The last page, or resume from `after`.
      let pos: number;
      if (after === null) {
        const page = await d.source.readBack(ref, null, this.#page);
        yield { type: 'snapshot', ...page };
        pos = page.end;
      } else pos = after;

      // 3. Follow the file until the run ends. A follow batch abandoned at stop is not lost: the final drain re-reads from `pos`.
      if (run.status === 'running' && !finished) {
        const stop = new AbortController();
        const it = d.source.follow(ref, pos, stop.signal)[Symbol.asyncIterator]();
        let next = it.next();
        try {
          for (;;) {
            const r = await Promise.race([next, finishedP.then((): typeof FINISHED => FINISHED)]);
            if (r === FINISHED) break;
            if (r.done) {
              await finishedP; // the file vanished midway: wait for the run to finish, then report `ended`
              break;
            }
            yield { type: 'entries', entries: r.value.entries, end: r.value.end };
            pos = r.value.end;
            next = it.next();
          }
        } finally {
          stop.abort();
          const last = await next.catch(() => null);
          if (last && !last.done) await it.return?.();
        }
        if (own.signal.aborted) return;
        await sleep(d.settleMs ?? 1000, own.signal);
        if (own.signal.aborted) return;
      }

      // 4. Drain one last time, then finish.
      const rest = await d.source.readForward(ref, pos);
      if (rest.entries.length > 0) yield { type: 'entries', entries: rest.entries, end: rest.end };
      run = await this.#run(runId);
      yield { type: 'ended', status: run.status };
    } finally {
      this.#followers--;
      signal.removeEventListener('abort', onAbort);
      own.abort();
    }
  }

  async #run(runId: string): Promise<RunRecord> {
    const run = await this.#d.runs.findById(runId);
    if (!run) throw new DomainError('RUN_NOT_FOUND', `No run ${runId}`);
    return run;
  }
}

/** Wait `ms` or until the signal aborts (never throws). */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}
