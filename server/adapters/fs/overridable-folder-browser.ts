import type { FolderBrowser, FolderLookup, FolderPlaces } from '../../ports/folders';
import { MemoryFolderFs, type FolderWorld } from './memory-folder-fs';
import { NodeFolderBrowser } from './node-folder-browser';

/**
 * Test mode: wraps the real FolderBrowser so tests can swap the whole "machine" for a `FolderWorld` (`POST /api/__test/folders`).
 * App screenshots next to the preview need exactly the preview's folder tree (`C:\Users\alice\…`, a Mac `/Users/alice/…`) on every machine running tests —
 * the fake world runs the real `NodeFolderBrowser` (same sort / hide / git rules) on `MemoryFolderFs`. Not set → the real machine.
 */
export class OverridableFolderBrowser implements FolderBrowser {
  readonly #real: FolderBrowser;
  #world: FolderBrowser | null = null;

  constructor(real: FolderBrowser) {
    this.#real = real;
  }

  set(world: FolderWorld | null): void {
    this.#world = world
      ? new NodeFolderBrowser({ platform: world.platform, home: world.home, fs: new MemoryFolderFs(world), knownFolders: async () => world.known ?? {} })
      : null;
  }

  clear(): void {
    this.#world = null;
  }

  #on(): FolderBrowser {
    return this.#world ?? this.#real;
  }

  list(path: string | null): Promise<FolderLookup> {
    return this.#on().list(path);
  }

  places(): Promise<FolderPlaces> {
    return this.#on().places();
  }

  parentOf(path: string): string | null {
    return this.#on().parentOf(path);
  }

  nameOf(path: string): string {
    return this.#on().nameOf(path);
  }

  same(a: string, b: string): boolean {
    return this.#on().same(a, b);
  }
}
