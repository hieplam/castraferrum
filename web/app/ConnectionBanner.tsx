// Banner under the top bar (preview list-disconnected / list-reconnected / list-db-down):
// - server lost (UC-17): red "Lost connection to the server, retrying..." · which retry · countdown · the instant the figures stopped at;
// - server alive but DB dead (D-UI4): red "DB is not responding..." · since when;
// - just reconnected: "Reconnected - data was just refreshed" for a few seconds (data already invalidated in web/data/live-sync.ts).
import { useNow, type ServerStatus } from '../data/connection';
import { fmtTime } from '../prefs/format';
import { useT } from '../prefs/prefs';
import { Banner } from '../ui/components';

export function ConnectionBanner({ status }: { status: ServerStatus }) {
  const t = useT();
  useNow(1_000); // redraw every second for the countdown
  const c = status.connection;
  if (c.status === 'down') {
    const secs = Math.max(0, Math.ceil((c.retryAt.getTime() - Date.now()) / 1000));
    const aside = `${t('banner.retry', { n: c.attempt, s: secs })} · ${t('banner.staleSince', { t: fmtTime(c.downSince) })}`;
    return (
      <Banner tone="err" testId="banner-disconnected" aside={aside}>
        {t('banner.disconnected')}
      </Banner>
    );
  }
  if (status.db === 'down' && status.dbDownSince) {
    return (
      <Banner tone="err" testId="banner-db-down" aside={t('banner.dbDownSince', { t: fmtTime(status.dbDownSince) })}>
        {t('banner.dbDown')}
      </Banner>
    );
  }
  if (status.reconnected) {
    return (
      <Banner tone="info" testId="banner-reconnected">
        {t('banner.reconnected')}
      </Banner>
    );
  }
  return null;
}
