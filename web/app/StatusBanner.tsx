// The banner of the whole console, first inside every page (spec 5.1): lost connection (red, with the attempt and the time to the
// next one), database not answering (warning), and "reconnected" (information) for a few seconds. The status comes from the frame.
import { useNow, type ServerStatus } from '../data/connection';
import { useT } from '../prefs/prefs';
import { Banner } from '../ui/kit/Banner';

export function StatusBanner({ status }: { status: ServerStatus }) {
  const t = useT();
  useNow(1_000); // redraw every second for the countdown
  const c = status.connection;
  if (c.status === 'down') {
    const secs = Math.max(0, Math.ceil((c.retryAt.getTime() - Date.now()) / 1000));
    return (
      <Banner tone="err" testId="banner-disconnected">
        <b>{t('banner.lost')}</b> {t('banner.lostRetry', { n: c.attempt, s: secs })}
      </Banner>
    );
  }
  if (status.db === 'down') {
    return (
      <Banner tone="warn" testId="banner-db-down">
        {t('banner.db')}
      </Banner>
    );
  }
  if (status.reconnected) {
    return (
      <Banner tone="info" testId="banner-reconnected">
        {t('banner.back')}
      </Banner>
    );
  }
  return null;
}
