import nodePath from 'node:path';
import type { FolderPlatform } from '../../ports/folders';
import type { KnownFolders } from './known-folders';
import type { FolderFs } from './node-folder-browser';

/**
 * A fake "machine" for the folder browser: operating system, home folder, Known Folders and the directory tree. Used for unit tests
 * (Mac / Linux rules run on Windows) and test mode (`POST /api/__test/folders` — app screenshots next to the preview need exactly the
 * preview's folder tree on every machine).
 */
export type FolderWorld = {
  platform: FolderPlatform;
  home: string;
  known?: KnownFolders;
  /** Every folder that really exists (absolute path); parent folders exist implicitly. `<folder>\.git` = that folder has git. */
  dirs: string[];
  /** Folder that exists but whose listing is denied (EPERM). */
  denied?: string[];
  /** Symlink / junction → target (e.g. `/Volumes/Macintosh HD` → `/`). */
  links?: Record<string, string>;
};

type Node = { path: string; children: Map<string, string>; link?: string };

const fail = (code: string, path: string) => Object.assign(new Error(`${code}: ${path}`), { code });

/** In-RAM FolderFs for a `FolderWorld`. Windows / Mac are case-insensitive (like default NTFS / APFS). */
export class MemoryFolderFs implements FolderFs {
  readonly #P: typeof nodePath.win32;
  readonly #fold: (s: string) => string;
  readonly #nodes = new Map<string, Node>();
  readonly #denied = new Set<string>();

  constructor(world: FolderWorld) {
    this.#P = world.platform === 'win32' ? nodePath.win32 : nodePath.posix;
    this.#fold = world.platform === 'linux' ? (s) => s : (s) => s.normalize('NFC').toLowerCase();
    for (const d of [world.home, ...Object.values(world.known ?? {}), ...world.dirs]) if (d) this.#add(d);
    for (const [from, to] of Object.entries(world.links ?? {})) {
      this.#add(this.#P.dirname(from));
      const node = this.#add(from);
      node.link = to;
    }
    for (const d of world.denied ?? []) this.#denied.add(this.#key(this.#P.resolve(d)));
  }

  async realpath(path: string): Promise<string> {
    return this.#resolve(path).path;
  }

  async stat(path: string): Promise<{ isDirectory(): boolean }> {
    this.#resolve(path);
    return { isDirectory: () => true };
  }

  async readdir(path: string): Promise<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }[]> {
    const node = this.#resolve(path);
    if (this.#denied.has(this.#key(node.path))) throw fail('EPERM', path);
    return [...node.children.values()].map((childPath) => {
      const child = this.#nodes.get(this.#key(childPath))!;
      const isLink = child.link !== undefined;
      return { name: this.#P.basename(childPath), isDirectory: () => !isLink, isSymbolicLink: () => isLink };
    });
  }

  #key(path: string): string {
    return this.#fold(path);
  }

  #add(path: string): Node {
    const P = this.#P;
    const abs = P.resolve(path);
    const existing = this.#nodes.get(this.#key(abs));
    if (existing) return existing;
    const node: Node = { path: abs, children: new Map() };
    this.#nodes.set(this.#key(abs), node);
    const up = P.dirname(abs);
    if (up !== abs) this.#add(up).children.set(this.#key(P.basename(abs)), abs);
    return node;
  }

  /** Walk from the root segment by segment (following links), return the real node — like `realpath`. */
  #resolve(path: string, depth = 0): Node {
    const P = this.#P;
    if (depth > 20) throw fail('ELOOP', path);
    const abs = P.resolve(path);
    const root = P.parse(abs).root;
    let node = this.#nodes.get(this.#key(root));
    if (!node) throw fail('ENOENT', path);
    for (const seg of abs.slice(root.length).split(P.sep).filter(Boolean)) {
      const childPath = node.children.get(this.#key(seg));
      if (childPath === undefined) throw fail('ENOENT', path);
      node = this.#nodes.get(this.#key(childPath))!;
      if (node.link !== undefined) node = this.#resolve(node.link, depth + 1);
    }
    return node;
  }
}
