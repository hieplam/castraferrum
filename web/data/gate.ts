// The gate pages (spec 2.8, goal G6, task K12): `GET` and `PUT /api/repos/:id/gate`, `GET /api/gate/jobs/:id`, Ratify and Queue again.
// The server decides every state and step; the web shows them. A job moves while the page is open, so both reads run again every few seconds.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './provider';
import { qk } from './query-keys';

const REFRESH_MS = 5000;

export function useGate(repoId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.gate(repoId), queryFn: () => api.gate(repoId), refetchInterval: REFRESH_MS });
}

export function useGateJob(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: qk.gateJob(id),
    queryFn: () => api.gateJob(id),
    refetchInterval: (query) => (query.state.data && ['queued', 'running'].includes(query.state.data.job.state) ? REFRESH_MS : false),
  });
}

/** The switch of the page: the answer is the new view, so the page shows it at once. */
export function useSetGateEnabled(repoId: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.setGateEnabled(repoId, enabled),
    onSuccess: (view) => client.setQueryData(qk.gate(repoId), view),
  });
}

export function useRatifyGateJob() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.ratifyGateJob(id),
    onSettled: () => client.invalidateQueries({ queryKey: ['gate'] }),
  });
}

export function useQueueGateJob(repoId: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (prNumber: number) => api.queueGateJob(repoId, prNumber),
    onSettled: () => client.invalidateQueries({ queryKey: ['gate'] }),
  });
}
