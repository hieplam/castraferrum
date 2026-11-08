// Keys of every query - in one place, so live-sync.ts invalidates the right prefix. Adding a query: add its key here, put it under
// the right prefix (`loops` / `loop` + id / `execution` + id / `run` + id) and live events refresh it by themselves.
import type { LoopListFilter, PageRequest } from '../api/loops-api';

export const qk = {
  /** Every loop list (every filter). */
  loops: () => ['loops'] as const,
  loopList: (filter: LoopListFilter) => ['loops', 'list', filter] as const,
  /** The overview bar + loops per tab - under prefix `loops`: every live event refreshes it. */
  overview: (tz: string, repoId?: string) => ['loops', 'overview', tz, repoId ?? null] as const,
  /** Registered repos - under prefix `loops`: the loops-per-repo count changes with loop events. */
  repos: () => ['loops', 'repos'] as const,
  /** Detail of one loop + everything under it (executions, runs). */
  loop: (id: string) => ['loop', id] as const,
  loopExecutions: (id: string, page: PageRequest = {}) => ['loop', id, 'executions', page] as const,
  loopRuns: (id: string, page: PageRequest = {}) => ['loop', id, 'runs', page] as const,
  /** The probe of one loop - under prefix `loop` + id: a run or loop event refreshes it. */
  probe: (id: string) => ['loop', id, 'probe'] as const,
  /** The open holds and the unread notices - under prefix `loops`: every live event refreshes them. */
  holds: () => ['loops', 'holds'] as const,
  notices: () => ['loops', 'notices'] as const,
  execution: (id: string) => ['execution', id] as const,
  run: (id: string) => ['run', id] as const,
  runLogs: (id: string) => ['run', id, 'logs'] as const,
  /** The "Browse..." box - outside prefix `loops`: loop events do not touch it; registering / deleting a repo refreshes it (repos.ts). */
  folders: () => ['folders'] as const,
  folder: (path: string | null) => ['folders', 'dir', path] as const,
  folderPlaces: () => ['folders', 'places'] as const,
  /** The process scoreboard - read when Settings or its page opens; no live event changes it. */
  scoreboard: (tz: string) => ['scoreboard', tz] as const,
  /** The gate page of a repo and one gate job. They change when a job runs, so the pages read them again every few seconds. */
  gate: (repoId: string) => ['gate', 'repo', repoId] as const,
  gateJob: (id: string) => ['gate', 'job', id] as const,
  /** The goal cards of a repo. A new card can arrive at any tick, so the page reads them again every few seconds. */
  goalCards: (repoId: string) => ['goal-cards', repoId] as const,
  health: () => ['health'] as const,
  executors: () => ['executors'] as const,
  schedulePreview: (cron: string, tz: string, lang: string) => ['schedule-preview', cron, tz, lang] as const,
};
