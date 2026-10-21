import * as nodeFs from 'node:fs/promises';
import { homedir } from 'node:os';
import nodePath from 'node:path';
import type {
  FolderBrowser,
  FolderEntry,
  FolderLookup,
  FolderPlaceKind,
  FolderPlaces,
  FolderPlatform,
} from '../../ports/folders';
import { windowsKnownFolders, type KnownFolders } from './known-folders';

/** The part of node:fs the browser needs — the real one is `fs/promises`; the fake `MemoryFolderFs` serves tests + the preview's world. */
export type FolderFs = {
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
  readdir(path: string): Promise<{ name: string; isDirectory(): boolean; isSymbolicLink(): boolean }[]>;
};

export type NodeFolderBrowserOptions = {
  /** Defaults to the running machine (`process.platform`; systems other than Windows / Mac count as Linux). Tests override it to run Mac rules on Windows. */
  platform?: FolderPlatform;
  /** Defaults to `os.homedir()`. */
  home?: string;
  fs?: FolderFs;
  /** The real Desktop / Documents / Downloads. Default: Windows asks the Known Folder (once), other machines use `~/Desktop`… */
  knownFolders?: () => Promise<KnownFolders>;
  /** Listing one folder takes too long (network drive dropped) → `unreadable: 'timeout'`. Defaults to 5 000 ms. */
  listTimeoutMs?: number;
  /** Cap on the number of subfolders returned. Defaults to 1 000. */
  maxEntries?: number;
};

const nodeFolderFs: FolderFs = {
  realpath: (p) => nodeFs.realpath(p), // native build: correct true letter case on Windows (node-directory-probe.ts)
  stat: (p) => nodeFs.stat(p),
  readdir: (p) => nodeFs.readdir(p, { withFileTypes: true }),
};

/** Backward-compatibility junctions in a Windows user profile (hidden + system, opening them gives EPERM) — only counted when it is a link. */
const WIN_LEGACY_JUNCTIONS = new Set([
  'application data', 'cookies', 'local settings', 'my documents', 'my music', 'my pictures', 'my videos', 'nethood',
  'printhood', 'recent', 'sendto', 'start menu', 'templates', 'documents and settings',
]);
/** System folders at a Windows drive root that Explorer hides. */
const WIN_ROOT_HIDDEN = new Set(['system volume information', 'recovery', 'config.msi', 'msocache', 'programdata', 'documents and settings', 'onedrivetemp']);
/** Unix folders at `/` that Finder hides. */
const DARWIN_ROOT_HIDDEN = new Set(['bin', 'cores', 'dev', 'etc', 'home', 'opt', 'private', 'sbin', 'tmp', 'usr', 'var', 'volumes']);

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const byName = (a: { name: string }, b: { name: string }) => collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

const TIMEOUT = Symbol('timeout');
async function within<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<typeof TIMEOUT>((resolve) => (timer = setTimeout(() => resolve(TIMEOUT), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/** Run `fn` for each element, at most `limit` jobs at once. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function currentPlatform(): FolderPlatform {
  return process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux';
}

/**
 * FolderBrowser on node:fs. Path rules follow `platform` (`path.win32` / `path.posix`), not the machine running the
 * test — unit tests run Mac rules on Windows via `MemoryFolderFs`. Returned paths are always canonical (`realpath`), like
 * what `NodeDirectoryProbe` stores when a repo is registered, so a chosen folder matches an already-registered repo.
 */
export class NodeFolderBrowser implements FolderBrowser {
  readonly #platform: FolderPlatform;
  readonly #home: string;
  readonly #fs: FolderFs;
  readonly #path: typeof nodePath.win32;
  readonly #known: () => Promise<KnownFolders>;
  readonly #listTimeoutMs: number;
  readonly #maxEntries: number;
  #knownOnce: Promise<KnownFolders> | null = null;

  constructor(opts: NodeFolderBrowserOptions = {}) {
    this.#platform = opts.platform ?? currentPlatform();
    this.#home = opts.home ?? homedir();
    this.#fs = opts.fs ?? nodeFolderFs;
    this.#path = this.#platform === 'win32' ? nodePath.win32 : nodePath.posix;
    this.#known = opts.knownFolders ?? (this.#platform === 'win32' && !opts.fs ? windowsKnownFolders : async () => ({}));
    this.#listTimeoutMs = opts.listTimeoutMs ?? 5000;
    this.#maxEntries = opts.maxEntries ?? 1000;
  }

  async list(input: string | null): Promise<FolderLookup> {
    const P = this.#path;
    let raw = (input ?? '').trim() || this.#home;
    if (raw === '~' || raw.startsWith('~/') || (this.#platform === 'win32' && raw.startsWith('~\\'))) raw = this.#home + raw.slice(1);
    if (this.#platform === 'win32' && /^[a-zA-Z]:$/.test(raw)) raw += '\\'; // "C:" = the drive root, not "the current folder of drive C"
    if (!P.isAbsolute(raw)) return { kind: 'notAbsolute' };

    let real: string;
    try {
      real = await this.#fs.realpath(raw);
      if (!(await this.#fs.stat(real)).isDirectory()) return { kind: 'notDirectory' };
    } catch {
      return { kind: 'notDirectory' };
    }

    const crumbs = this.#crumbs(real);
    const parent = this.parentOf(real);
    const [listed, git] = await Promise.all([this.#entries(real, parent === null), this.#hasGit(real)]);
    return {
      kind: 'ok',
      path: real,
      name: crumbs[crumbs.length - 1]!.name,
      parent,
      crumbs,
      git,
      entries: listed.entries,
      truncated: listed.truncated,
      unreadable: listed.unreadable,
    };
  }

  async places(): Promise<FolderPlaces> {
    const P = this.#path;
    this.#knownOnce ??= this.#known().catch(() => ({}));
    const known = await this.#knownOnce;
    const home = this.#home;
    const wanted: [FolderPlaceKind, string][] = [
      ['home', home],
      ['desktop', known.desktop ?? P.join(home, 'Desktop')],
      ['documents', known.documents ?? P.join(home, 'Documents')],
      ['downloads', known.downloads ?? P.join(home, 'Downloads')],
    ];
    const places: FolderPlaces['places'] = [];
    for (const [kind, path] of wanted) {
      if (places.some((p) => this.same(p.path, path))) continue;
      if (await this.#isDir(path)) places.push({ kind, path });
    }
    return { platform: this.#platform, home, places, roots: await this.#roots() };
  }

  parentOf(path: string): string | null {
    if (!this.#path.isAbsolute(path)) return null; // e.g. a Windows-path repo inside a test's fake Mac world
    const up = this.#path.dirname(path);
    return up === path ? null : up;
  }

  nameOf(path: string): string {
    return this.#crumbs(path).pop()!.name;
  }

  same(a: string, b: string): boolean {
    if (this.#platform === 'linux') return a === b;
    return a.normalize('NFC').toLowerCase() === b.normalize('NFC').toLowerCase();
  }

  // ---------------------------------------------------------------- internals

  #crumbs(real: string): { name: string; path: string }[] {
    const P = this.#path;
    const root = P.parse(real).root;
    // The root shows as the user typed it: "C:" (trailing "\" dropped), "\\machine\share", "/".
    const rootName = this.#platform === 'win32' ? root.replace(/\\$/, '') || root : root;
    const crumbs = [{ name: rootName, path: root }];
    let acc = root;
    for (const seg of real.slice(root.length).split(P.sep).filter(Boolean)) {
      acc = acc.endsWith(P.sep) ? acc + seg : acc + P.sep + seg;
      crumbs.push({ name: seg, path: acc });
    }
    return crumbs;
  }

  async #entries(dir: string, atRoot: boolean): Promise<{ entries: FolderEntry[]; truncated: boolean; unreadable: 'denied' | 'timeout' | null }> {
    let dirents: Awaited<ReturnType<FolderFs['readdir']>>;
    try {
      const got = await within(this.#fs.readdir(dir), this.#listTimeoutMs);
      if (got === TIMEOUT) return { entries: [], truncated: false, unreadable: 'timeout' };
      dirents = got;
    } catch {
      return { entries: [], truncated: false, unreadable: 'denied' };
    }
    const P = this.#path;
    const atHome = this.same(dir, this.#home);
    const candidates = await mapLimit(dirents, 16, async (d) => {
      if (d.isDirectory()) return { name: d.name, link: false };
      if (!d.isSymbolicLink()) return null;
      // Link (symlink, junction, OneDrive): only taken when the target is a folder.
      const st = await within(this.#fs.stat(P.join(dir, d.name)).catch(() => null), 2000);
      return st !== TIMEOUT && st?.isDirectory() ? { name: d.name, link: true } : null;
    });
    const dirs = candidates.filter((c): c is { name: string; link: boolean } => c !== null).sort(byName);
    const kept = dirs.slice(0, this.#maxEntries);
    const entries = await mapLimit(kept, 16, async (c): Promise<FolderEntry> => {
      const path = P.join(dir, c.name);
      return { name: c.name, path, git: await this.#hasGit(path), hidden: this.#hidden(c.name, c.link, atRoot, atHome) };
    });
    return { entries, truncated: dirs.length > kept.length, unreadable: null };
  }

  #hidden(name: string, link: boolean, atRoot: boolean, atHome: boolean): boolean {
    if (name.startsWith('.')) return true;
    const lower = name.toLowerCase();
    if (this.#platform === 'win32') {
      return name.startsWith('$') || (link && WIN_LEGACY_JUNCTIONS.has(lower)) || (atRoot && WIN_ROOT_HIDDEN.has(lower)) || (atHome && lower === 'appdata');
    }
    if (this.#platform === 'darwin') return (atRoot && DARWIN_ROOT_HIDDEN.has(lower)) || (atHome && lower === 'library');
    return false;
  }

  async #hasGit(dir: string): Promise<boolean> {
    const st = await within(this.#fs.stat(this.#path.join(dir, '.git')).catch(() => null), 2000);
    return st !== TIMEOUT && st !== null;
  }

  async #isDir(path: string): Promise<boolean> {
    const st = await within(this.#fs.stat(path).catch(() => null), 2000);
    return st !== TIMEOUT && st !== null && st.isDirectory();
  }

  async #roots(): Promise<FolderPlaces['roots']> {
    if (this.#platform === 'win32') {
      const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
      // A dropped network drive can hang stat → on timeout still list it (the drive exists, just slow); clicking it gives `unreadable: timeout`.
      const found = await Promise.all(
        letters.map(async (l) => {
          const st = await within(this.#fs.stat(`${l}:\\`).catch(() => null), 1500);
          return st === TIMEOUT || st?.isDirectory() ? l : null;
        }),
      );
      return found.filter((l): l is string => l !== null).map((l) => ({ name: `${l}:`, path: `${l}:\\` }));
    }
    const roots = [{ name: '/', path: '/' }];
    if (this.#platform !== 'darwin') return roots;
    // Mac: /Volumes/<boot drive> is a symlink to "/" → name the "/"; the other entries are external / network drives.
    let vols: Awaited<ReturnType<FolderFs['readdir']>> = [];
    try {
      const got = await within(this.#fs.readdir('/Volumes'), 1500);
      if (got !== TIMEOUT) vols = got;
    } catch {
      vols = [];
    }
    for (const v of [...vols].sort(byName)) {
      if (v.name.startsWith('.') || v.name.startsWith('com.apple.')) continue;
      const path = `/Volumes/${v.name}`;
      const real = await within(this.#fs.realpath(path).catch(() => null), 1500);
      if (real === '/') roots[0] = { name: v.name, path: '/' };
      else if (real !== null) roots.push({ name: v.name, path });
    }
    return roots;
  }
}
