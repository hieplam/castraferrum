import type { ActiveRunRegistry } from '../../ports/active-runs';

/** Runs executing in this process (single process — D3). If the process dies everything is lost; recovery handles the DB side. */
export class InMemoryActiveRuns implements ActiveRunRegistry {
  readonly #controllers = new Map<string, AbortController>();

  register(runId: string, controller: AbortController): void {
    this.#controllers.set(runId, controller);
  }

  abort(runId: string, reason: 'cancelled' | 'timed_out'): boolean {
    const c = this.#controllers.get(runId);
    if (!c) return false;
    if (!c.signal.aborted) c.abort(reason);
    return true;
  }

  /**
   * Graceful server shutdown (composition root, not part of the port): abort every run's signal WITHOUT recording a result — the run stays `running`
   * in the DB and is marked `interrupted` on the next start, exactly as if the server had died (spec § Run rules). Returns the run count.
   */
  abortAll(reason = 'shutdown'): number {
    let n = 0;
    for (const c of this.#controllers.values()) {
      if (!c.signal.aborted) {
        c.abort(reason);
        n++;
      }
    }
    return n;
  }

  release(runId: string): void {
    this.#controllers.delete(runId);
  }

  size(): number {
    return this.#controllers.size;
  }
}
