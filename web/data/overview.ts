// The overview bar + loops per tab of the list (UC-03) - `GET /api/stats`. Every figure is counted by the server in the DB;
// the web does not add up from the list (stub check of phase 1). The key sits under prefix `loops`, so every live event refreshes it.
import { useQuery } from '@tanstack/react-query';
import { useApi } from './provider';
import { qk } from './query-keys';

const FALLBACK_TZ = 'Asia/Ho_Chi_Minh';

/** The browser's time zone - "today" of the overview bar is the day of the person looking. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TZ;
  } catch {
    return FALLBACK_TZ;
  }
}

/** `repoId` (UC-25): loops per tab for the repo being filtered - the overview figures of the top bar are always for the whole console. */
export function useOverview(repoId?: string) {
  const api = useApi();
  const tz = browserTimeZone();
  return useQuery({ queryKey: qk.overview(tz, repoId), queryFn: () => api.overview(tz, repoId) });
}
