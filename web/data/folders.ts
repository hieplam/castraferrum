// The "Browse..." box of the Repo page (UC-29): folders on the machine running the console. Navigation is a chain of steps (into a child,
// up to the parent, typing a path...): the shown folder stays until the new folder has loaded; if a step fails (a typed path that does not
// exist) it reports its own error and the list stays the old folder. Loaded folders sit in the cache (`qk.folder`) - going back is instant;
// registering / deleting a repo refreshes the whole group (repos.ts) because the "repo ..." labels change.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type { FolderDto } from '../../shared/contracts/folders';
import { useApi } from './provider';
import { qk } from './query-keys';

/** The Quick access column + the operating system of the machine running the console (so the path box hints in the right style `C:\...` / `/Users/alice/...`). */
export function useFolderPlaces() {
  const api = useApi();
  return useQuery({ queryKey: qk.folderPlaces(), queryFn: () => api.folderPlaces(), staleTime: 60_000 });
}

export type FolderNav = {
  /** The shown folder; `null` while no folder has loaded yet. */
  folder: FolderDto | null;
  /** Loading a new folder (the old one stays shown). */
  loading: boolean;
  /** Error of the latest step the user clicked / typed; cleared when a step succeeds. */
  error: unknown;
  /** Go to a folder (`null` = the home folder); `fresh` = re-read the disk, skip the cache. Returns `true` when it arrived. */
  go(path: string | null, fresh?: boolean): Promise<boolean>;
  /** Open the box: try places one after another and stop at the first that arrives; errors of the tried places are not reported. */
  open(candidates: readonly (string | null)[]): Promise<void>;
};

export function useFolderNav(): FolderNav {
  const api = useApi();
  const client = useQueryClient();
  const [folder, setFolder] = useState<FolderDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const seq = useRef(0); // the newest step wins: a late result of an older step is dropped

  const fetchDir = useCallback(
    (path: string | null, fresh: boolean) =>
      client.fetchQuery({ queryKey: qk.folder(path), queryFn: () => api.browseFolder(path ?? undefined), staleTime: fresh ? 0 : 5_000 }),
    [api, client],
  );

  const go = useCallback(
    async (path: string | null, fresh = false) => {
      const my = ++seq.current;
      setLoading(true);
      try {
        const dir = await fetchDir(path, fresh);
        if (my !== seq.current) return false;
        setFolder(dir);
        setError(null);
        return true;
      } catch (err) {
        if (my === seq.current) setError(err);
        return false;
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [fetchDir],
  );

  const open = useCallback(
    async (candidates: readonly (string | null)[]) => {
      const my = ++seq.current;
      setLoading(true);
      let last: unknown = null;
      for (const path of candidates) {
        try {
          const dir = await fetchDir(path, true);
          if (my !== seq.current) return;
          setFolder(dir);
          setError(null);
          setLoading(false);
          return;
        } catch (err) {
          last = err;
        }
      }
      if (my === seq.current) {
        setError(last);
        setLoading(false);
      }
    },
    [fetchDir],
  );

  return { folder, loading, error, go, open };
}
