// Hooks that read / write loops (list screen phase 1, form phase 1, detail phase 1). Every figure comes from the API - the web does not
// recompute (stub check of phase 1). Live events invalidate by themselves (live-sync.ts); a finished mutation also invalidates at once so
// the screen of the person who clicked does not wait for the event.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoopInputBody, LoopUpdateBody } from '../../shared/contracts/loops';
import type { LoopListFilter } from '../api/loops-api';
import { useApi } from './provider';
import { qk } from './query-keys';

export function useLoops(filter: LoopListFilter = {}) {
  const api = useApi();
  return useQuery({ queryKey: qk.loopList(filter), queryFn: () => api.listLoops(filter) });
}

export function useLoop(id: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.loop(id), queryFn: () => api.getLoop(id) });
}

export type LoopAction = 'start' | 'stop' | 'duplicate' | 'archive' | 'restore';

/** Start / Stop / duplicate / archive / restore. An error is an `ApiError` (`code` -> toast, D-UI3). */
export function useLoopAction() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, id }: { action: LoopAction; id: string }) => {
      switch (action) {
        case 'start':
          return api.startLoop(id);
        case 'stop':
          return api.stopLoop(id);
        case 'duplicate':
          return api.duplicateLoop(id);
        case 'archive':
          await api.archiveLoop(id);
          return null;
        case 'restore':
          return api.restoreLoop(id);
      }
    },
    onSettled: (_data, _err, { id }) => {
      void client.invalidateQueries({ queryKey: qk.loops() });
      void client.invalidateQueries({ queryKey: qk.loop(id) });
    },
  });
}

export function useCreateLoop() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    // The repo is sent by the form's picker; missing -> the server reports `repoId: required` at that field.
    mutationFn: (body: LoopInputBody) => api.createLoop(body),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.loops() }),
  });
}

/** Edit with `version` (UC-09): error `VERSION_CONFLICT` -> the form shows a conflict warning, never overwrites silently. */
export function useUpdateLoop(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: LoopUpdateBody) => api.updateLoop(id, body),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.loops() });
      void client.invalidateQueries({ queryKey: qk.loop(id) });
    },
  });
}

export function useExecutors() {
  const api = useApi();
  return useQuery({ queryKey: qk.executors(), queryFn: () => api.listExecutors(), staleTime: Infinity });
}

/** The description sentence + the next 5 runs from the server (the web could also compute them with shared/domain/schedule.ts). */
export function useSchedulePreview(cron: string, tz: string, lang: 'vi' | 'en', enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: qk.schedulePreview(cron, tz, lang),
    queryFn: () => api.schedulePreview(cron, tz, lang),
    enabled: enabled && cron.trim() !== '',
    retry: false,
  });
}
