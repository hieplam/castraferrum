// Browsing folders on the machine running the console — the "Browse…" box on the Repo page. A browser does not let a web page learn the
// absolute path of the folder the user picks, so the server (same machine, 127.0.0.1) lists folders. The service must not touch
// node:fs itself (layer rule) → it goes through this port; the adapter lives in server/adapters/fs/. All path rules (roots, separators, letter case,
// hidden folders) live in the adapter — the service and the UI only use the strings the adapter returns.

export type FolderPlatform = 'win32' | 'darwin' | 'linux';

/** A sub-folder. `path` = the machine's canonical absolute path. */
export type FolderEntry = {
  name: string;
  path: string;
  /** Has `.git` (a folder, or a file for a worktree) directly inside. Only a hint: a repo does not have to be git. */
  git: boolean;
  /** Hidden by OS convention (`.x`; Windows: `$x`, AppData, old junctions...; Mac: Library, system folders under `/`). */
  hidden: boolean;
};

export type FolderListing = {
  kind: 'ok';
  /** Canonical form (`realpath`: `..` removed, symlinks followed, real letter case) — the same form `DirectoryProbe` returns when a repo is registered. */
  path: string;
  /** Display name (the folder name; for a root, the root itself: `C:`, `/`). */
  name: string;
  /** `null` at a root (`C:\`, `/`). */
  parent: string | null;
  /** From the root down to this folder (the last element is the folder itself). */
  crumbs: { name: string; path: string }[];
  git: boolean;
  /** Sub-folders, sorted by name (case-insensitive, numbers by value); cut off when `truncated`. */
  entries: FolderEntry[];
  truncated: boolean;
  /** The folder exists but cannot be listed: `denied` (no permission — EPERM / EACCES), `timeout` (a network drive did not answer). */
  unreadable: 'denied' | 'timeout' | null;
};

export type FolderLookup =
  | FolderListing
  /** Not an absolute path (after expanding `~`). */
  | { kind: 'notAbsolute' }
  /** Does not exist, or is a file. */
  | { kind: 'notDirectory' };

export type FolderPlaceKind = 'home' | 'desktop' | 'documents' | 'downloads';

export type FolderPlaces = {
  platform: FolderPlatform;
  home: string;
  /** Familiar folders that really exist on the machine (Windows: the real Known Folder — Desktop may live in OneDrive, with a localized name). */
  places: { kind: FolderPlaceKind; path: string }[];
  /** Windows: drives (`C:` → `C:\`); Mac: the startup disk (name from `/Volumes`, pointing at `/`) + external disks; Linux: `/`. */
  roots: { name: string; path: string }[];
};

export interface FolderBrowser {
  /** `null` = the home folder. Accepts `~` / `~/x` (expanded to the home folder). */
  list(path: string | null): Promise<FolderLookup>;
  places(): Promise<FolderPlaces>;
  /** Parent folder by the machine's path rules; `null` at a root. Does not hit the disk. */
  parentOf(path: string): string | null;
  /** Display name of a path (the last folder; for a root, `C:` / `/`). Does not hit the disk. */
  nameOf(path: string): string;
  /** Whether two canonical paths are the same folder (Windows / Mac: case-insensitive). Does not hit the disk. */
  same(a: string, b: string): boolean;
}
