// A message about the whole console or the whole page (`.banner`): disconnected, database down, reconnected.
import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export type BannerTone = 'err' | 'warn' | 'info';

const TONE: Record<BannerTone, string> = { err: 'is-err', warn: 'is-warn', info: 'is-info' };

export function Banner({ tone, testId, children }: { tone: BannerTone; testId?: string; children: ReactNode }) {
  return (
    <div className={cx('banner', TONE[tone])} data-testid={testId} role="status">
      <Icon name={tone === 'info' ? 'info' : 'alert'} />
      <span className="banner-text">{children}</span>
    </div>
  );
}
