// Registered repos (SPEC-phase-2 section "API contract", UC-19 · 20 · 25): the list (with the folder-still-exists flag - D-UI11 -
// and the number of loops using it), register, delete. The key is under prefix `loops`, so loop events (create, archive...) refresh the loops-using count.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RepoInputBody } from '../../shared/contracts/repos';
import { useApi } from './provider';
import { qk } from './query-keys';

export function useRepos() {
  const api = useApi();
  return useQuery({ queryKey: qk.repos(), queryFn: () => api.listRepos() });
}

export function useCreateRepo() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RepoInputBody) => api.createRepo(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.repos() });
      void client.invalidateQueries({ queryKey: qk.folders() }); // the "repo ..." labels + the "next to a repo" group of the Browse... box
    },
  });
}

export function useDeleteRepo() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRepo(id),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.repos() });
      void client.invalidateQueries({ queryKey: qk.folders() });
    },
  });
}

/** Last folder name of a path (Windows `\` or `/`) - the auto-filled repo name (D-UI10). */
export function folderName(path: string): string {
  const parts = path.trim().replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] ?? '';
}
