// The goal-driven loop on the loop page and in the editor (goal G28): the probe of a loop, the open holds and the unread notices.
// The probe tick sends no live event, so the probe and the holds are also read again every few seconds while a page shows them.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ProbeInputBody } from '../../shared/contracts/goal-loop';
import { parseProbeLine, RESERVED_RESOURCE, type ProbeLine, type ProbeState } from '../../shared/domain/goal-loop';
import { useApi } from './provider';
import { qk } from './query-keys';

/** How often the loop page reads the probe and the holds again (the console calls the probe every 60 s). */
const POLL_MS = 3_000;

/** The probe of a loop, or `null` when it has none. The cache keeps a failed read as no probe: the page then keeps today's look. */
export function useProbe(loopId: string) {
  const api = useApi();
  return useQuery({ queryKey: qk.probe(loopId), queryFn: () => api.getProbe(loopId), refetchInterval: POLL_MS, retry: false });
}

/** The open holds, oldest first. Only a loop with a probe asks for them (`enabled`). */
export function useHolds(enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: qk.holds(), queryFn: () => api.listHolds(), enabled, refetchInterval: POLL_MS, retry: false });
}

/** Marks every unread notice of the loop read, once the loop page has rendered (spec 2.6). */
export function useReadNoticesOf(loopId: string, enabled: boolean) {
  const api = useApi();
  const client = useQueryClient();
  const notices = useQuery({ queryKey: qk.notices(), queryFn: () => api.listNotices(), enabled, refetchInterval: POLL_MS, retry: false });
  const unread = (notices.data ?? []).filter((n) => n.loopId === loopId).map((n) => n.id);
  const key = unread.join(',');
  useEffect(() => {
    if (!key) return;
    void Promise.all(key.split(',').map((id) => api.markNoticeRead(id))).finally(() => void client.invalidateQueries({ queryKey: qk.notices() }));
  }, [api, client, key]);
}

/** Saves the probe settings (`PUT`) or removes the probe (`DELETE`, `body` null). */
export function useSaveProbe(loopId: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ProbeInputBody | null) => (body ? api.saveProbe(loopId, body).then(() => undefined) : api.deleteProbe(loopId)),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.probe(loopId) });
      void client.invalidateQueries({ queryKey: qk.loops() });
    },
  });
}

/** What the loop page reads out of the stored probe line. `line` is `null` when the line is not valid (a failed probe, or no call yet). */
export type ProbeReading = { state: ProbeState; line: ProbeLine | null; raw: string | null };

export function readProbe(probe: { state: ProbeState; lastLine: string | null }): ProbeReading {
  if (probe.lastLine === null) return { state: probe.state, line: null, raw: null };
  const parsed = parseProbeLine(probe.lastLine);
  return { state: probe.state, line: parsed.ok ? parsed.line : null, raw: probe.lastLine };
}

/**
 * The line as the page shows it. A `blocked` line with blockers shows them as cells above, so the key `blockers` is left out
 * (decision 52). `JSON.stringify` of the parsed object keeps the order of the other keys.
 */
export function shownProbeLine(raw: string): string {
  const parsed = parseProbeLine(raw);
  if (!parsed.ok || parsed.line.action !== 'blocked' || parsed.line.blockers.length === 0) return raw;
  try {
    const object = JSON.parse(raw) as Record<string, unknown>;
    delete object.blockers;
    return JSON.stringify(object);
  } catch {
    return raw;
  }
}

/** The hold the page names: the plan window first, then the oldest. */
export function mainHold<H extends { resource: string }>(holds: readonly H[] | undefined): H | null {
  return holds?.find((h) => h.resource === RESERVED_RESOURCE) ?? holds?.[0] ?? null;
}
