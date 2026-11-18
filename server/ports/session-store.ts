/** One signed-in session (remote-access spec D3). */
export type SessionRecord = { username: string; expiresAt: Date };

/**
 * Where sessions live. The console keeps them in memory (spec D3): sign-out or a restart ends them, and no secret is written to
 * disk. The token is the key; the service issues it through `Secrets`.
 */
export interface SessionStore {
  put(token: string, session: SessionRecord): void;
  get(token: string): SessionRecord | undefined;
  delete(token: string): void;
  /** Drops every session whose `expiresAt` is at or before `now`. */
  sweep(now: Date): void;
}
