// History hooks (loop / execution / run detail screens): executions, runs, logs. Cursor pagination of the API.
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { LogLineDto, RunDto } from '../../shared/contracts/loops';
import { useApi, useLive } from './provider';
import { qk } from './query-keys';

export function useLoopExecutions(loopId: string, limit = 20) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: qk.loopExecutions(loopId, { limit }),
    queryFn: ({ pageParam }) => api.listExecutions(loopId, { limit, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useLoopRuns(loopId: string, limit = 20) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: qk.loopRuns(loopId, { limit }),
    queryFn: ({ pageParam }) => api.listRuns(loopId, { limit, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useExecution(id: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.execution(id), queryFn: () => api.getExecution(id) });
}

export function useRun(id: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.run(id), queryFn: () => api.getRun(id) });
}

/**
 * The loop that holds an execution / a run (the row selected in the list pane while on `/executions/:id`, `/runs/:id`). Uses
 * the very key of `useExecution` / `useRun` -> an open detail screen has already loaded it, so no extra API call.
 */
export function useOwnerLoopId(ref: { executionId?: string | undefined; runId?: string | undefined }): string | undefined {
  const api = useApi();
  const exec = useQuery({ queryKey: qk.execution(ref.executionId ?? ''), queryFn: () => api.getExecution(ref.executionId as string), enabled: !!ref.executionId });
  const run = useQuery({ queryKey: qk.run(ref.runId ?? ''), queryFn: () => api.getRun(ref.runId as string), enabled: !!ref.runId });
  return (ref.executionId ? exec.data?.loopId : undefined) ?? (ref.runId ? run.data?.loopId : undefined);
}

export type RunLogsState = {
  lines: LogLineDto[];
  /** `following` = watching live; `paused` = connection lost, waiting to reconnect; `ended` = the run is done. */
  mode: 'following' | 'paused' | 'ended';
  endStatus: RunDto['status'] | null;
};

/**
 * Log of a run: watch the SSE stream (replays the stored log, then pushes on, UC-06 <= 1 second); for a finished run the stream replays
 * everything, then `end`. De-duplicate by `seq` (a reconnect has `Last-Event-ID`, but being defensive costs nothing).
 */
export function useRunLogs(runId: string | null): RunLogsState {
  const live = useLive();
  const [state, setState] = useState<RunLogsState>({ lines: [], mode: 'following', endStatus: null });
  useEffect(() => {
    setState({ lines: [], mode: 'following', endStatus: null });
    if (!runId) return undefined;
    return live.followRunLogs(runId, 0, {
      onLine: (line) =>
        setState((s) => (s.lines.length && line.seq <= (s.lines[s.lines.length - 1] as LogLineDto).seq ? s : { ...s, lines: [...s.lines, line] })),
      onEnd: (end) => setState((s) => ({ ...s, mode: 'ended', endStatus: end.status })),
      onDisconnect: () => setState((s) => (s.mode === 'ended' ? s : { ...s, mode: 'paused' })),
      onReconnect: () => setState((s) => (s.mode === 'ended' ? s : { ...s, mode: 'following' })),
    });
  }, [live, runId]);
  return state;
}
