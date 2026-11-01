// The process scoreboard (spec 2.12, goal G15): `GET /api/process/scoreboard`. Every figure, week and split is counted by the server;
// the web only formats it. A failed request is not retried: Settings hides its link and the page shows the error.
import { useQuery } from '@tanstack/react-query';
import { browserTimeZone } from './overview';
import { useApi } from './provider';
import { qk } from './query-keys';

export function useScoreboard() {
  const api = useApi();
  const tz = browserTimeZone();
  return useQuery({ queryKey: qk.scoreboard(tz), queryFn: () => api.scoreboard(tz), retry: false });
}

/** `dd/mm` of an instant in `timeZone`: the day of a week start or of a check merge, as the preview draws it. */
export function fmtDayMonth(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: '2-digit' }).format(at);
}
