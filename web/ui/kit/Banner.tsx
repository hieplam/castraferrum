// A message about the whole console or the whole page (`.banner`): disconnected, database down, reconnected.
import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export type BannerTone = 'err' | 'warn' | 'info';

const TONE: Record<BannerTone, string> = { err: 'is-err', warn: 'is-warn', info: 'is-info' };

/** `alert` = the answer to what the user just did (a refused delete), announced at once; otherwise a status. */
/** `data` adds the `data-*` attributes the tests read (the error code of the sign-in screen). */
export function Banner({
  tone,
  testId,
  alert,
  data,
  children,
}: {
  tone: BannerTone;
  testId?: string;
  alert?: boolean;
  data?: Record<`data-${string}`, string | undefined>;
  children: ReactNode;
}) {
  return (
    <div className={cx('banner', TONE[tone])} data-testid={testId} role={alert ? 'alert' : 'status'} {...data}>
      <Icon name={tone === 'info' ? 'info' : 'alert'} />
      <span className="banner-text">{children}</span>
    </div>
  );
}
