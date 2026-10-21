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
  execution: (id: string) => ['execution', id] as const,
  run: (id: string) => ['run', id] as const,
  runLogs: (id: string) => ['run', id, 'logs'] as const,
  /** The "Browse..." box - outside prefix `loops`: loop events do not touch it; registering / deleting a repo refreshes it (repos.ts). */
  folders: () => ['folders'] as const,
  folder: (path: string | null) => ['folders', 'dir', path] as const,
  folderPlaces: () => ['folders', 'places'] as const,
  health: () => ['health'] as const,
  executors: () => ['executors'] as const,
  schedulePreview: (cron: string, tz: string, lang: string) => ['schedule-preview', cron, tz, lang] as const,
};
