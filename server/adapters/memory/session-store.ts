import type { SessionRecord, SessionStore } from '../../ports/session-store';

/** Sessions in a Map (remote-access spec D3: in memory, so sign-out or a restart ends them). */
export class MemorySessionStore implements SessionStore {
  readonly #sessions = new Map<string, SessionRecord>();

  put(token: string, session: SessionRecord): void {
    this.#sessions.set(token, { ...session });
  }

  get(token: string): SessionRecord | undefined {
    const s = this.#sessions.get(token);
    return s ? { ...s } : undefined;
  }

  delete(token: string): void {
    this.#sessions.delete(token);
  }

  sweep(now: Date): void {
    for (const [token, s] of this.#sessions) if (s.expiresAt.getTime() <= now.getTime()) this.#sessions.delete(token);
  }

  get size(): number {
    return this.#sessions.size;
  }
}
