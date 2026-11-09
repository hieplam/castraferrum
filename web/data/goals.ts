// The goal number of a loop (spec 2.10, goal G11): `GET /api/loops/:id/goals`. The merge gate runs the goal rows after each merge and
// sends no live event for it, so the loop page and the goals page read the view again every few seconds. A failed read is not retried:
// the loop page then keeps its probe figure, and the goals page shows the error.
import { useQuery } from '@tanstack/react-query';
import { useApi } from './provider';
import { qk } from './query-keys';

const POLL_MS = 3_000;

export function useGoalView(loopId: string, manifest: string | null = null) {
  const api = useApi();
  return useQuery({
    queryKey: qk.goalView(loopId, manifest),
    queryFn: () => api.goalView(loopId, manifest ?? undefined),
    refetchInterval: POLL_MS,
    retry: false,
  });
}
