// A message about the whole console or the whole page (`.banner`): disconnected, database down, reconnected.
import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export type BannerTone = 'err' | 'warn' | 'info';

const TONE: Record<BannerTone, string> = { err: 'is-err', warn: 'is-warn', info: 'is-info' };

/** `alert` = the answer to what the user just did (a refused delete), announced at once; otherwise a status. */
export function Banner({ tone, testId, alert, children }: { tone: BannerTone; testId?: string; alert?: boolean; children: ReactNode }) {
  return (
    <div className={cx('banner', TONE[tone])} data-testid={testId} role={alert ? 'alert' : 'status'}>
      <Icon name={tone === 'info' ? 'info' : 'alert'} />
      <span className="banner-text">{children}</span>
    </div>
  );
}
