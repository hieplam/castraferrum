// A status: a dot and a word (`.pill`), never colour alone. The word is the caller's text.
import type { ReactNode } from 'react';
import { cx } from './cx';

export type PillTone = 'run' | 'ok' | 'fail' | 'int' | 'skip' | 'stop' | 'warn' | 'wait';

const TONE: Record<PillTone, string> = { run: 's-run', ok: 's-ok', fail: 's-fail', int: 's-int', skip: 's-skip', stop: 's-stop', warn: 's-warn', wait: 's-wait' };

export function Pill({ tone, testId, status, className, children }: { tone: PillTone; testId?: string; status?: string; className?: string; children: ReactNode }) {
  return (
    <span className={cx('pill', TONE[tone], className)} data-testid={testId} data-status={status}>
      {children}
    </span>
  );
}
