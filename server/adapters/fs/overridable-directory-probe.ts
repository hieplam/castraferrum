import type { DirectoryCheck, DirectoryProbe } from '../../ports/directory';

/**
 * Test mode: wraps the real DirectoryProbe so tests can force "this folder exists / is gone" by the exact path string
 * (`POST /api/__test/dirs`). App screenshots next to the preview seed the preview's sample repos (`C:\Users\alice\…`), which the test machine may
 * or may not have — force it so the "folder no longer exists" column (D-UI11) looks exactly like the preview on every machine. Paths that are not forced
 * ask the real file system.
 */
export class OverridableDirectoryProbe implements DirectoryProbe {
  readonly #inner: DirectoryProbe;
  readonly #overrides = new Map<string, boolean>();

  constructor(inner: DirectoryProbe) {
    this.#inner = inner;
  }

  set(paths: Record<string, boolean>): void {
    for (const [path, exists] of Object.entries(paths)) this.#overrides.set(path, exists);
  }

  clear(): void {
    this.#overrides.clear();
  }

  check(path: string): Promise<DirectoryCheck> {
    const forced = this.#overrides.get(path);
    if (forced === undefined) return this.#inner.check(path);
    if (!forced) return Promise.resolve({ kind: 'notDirectory' });
    return Promise.resolve({ kind: 'ok', path, name: path.split(/[\\/]/).filter(Boolean).pop() ?? path });
  }
}
