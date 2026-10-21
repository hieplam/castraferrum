import { realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute } from 'node:path';
import type { DirectoryCheck, DirectoryProbe } from '../../ports/directory';

/**
 * DirectoryProbe on node:fs. The canonical path = `realpath` from fs/promises: strips `..` / stray `\`, follows symlinks, and
 * on Windows returns the true letter case (measured 19/10/2026: `c:/users/alice/downloads/` → `C:\Users\alice\Downloads`) —
 * two ways of typing the same folder become one string, so the DB's "path must be unique" constraint catches it.
 */
export class NodeDirectoryProbe implements DirectoryProbe {
  async check(path: string): Promise<DirectoryCheck> {
    if (!isAbsolute(path)) return { kind: 'notAbsolute' };
    try {
      const real = await realpath(path);
      if (!(await stat(real)).isDirectory()) return { kind: 'notDirectory' };
      return { kind: 'ok', path: real, name: basename(real) || real };
    } catch {
      return { kind: 'notDirectory' };
    }
  }
}
