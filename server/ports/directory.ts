// Asks the file system about a folder, when a repo is registered. The service must not touch node:fs itself
// (layer rule), so it goes through this port; the adapter lives in server/adapters/fs/.

export type DirectoryCheck =
  /** `path` = canonical absolute path (`..` removed, real letter case on Windows); `name` = folder name. */
  | { kind: 'ok'; path: string; name: string }
  /** Not an absolute path. */
  | { kind: 'notAbsolute' }
  /** Does not exist, or is a file rather than a folder. */
  | { kind: 'notDirectory' };

export interface DirectoryProbe {
  check(path: string): Promise<DirectoryCheck>;
}
