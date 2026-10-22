// The inset list (`.group` and its `.cell`s): the one list of every screen (settings rows, runs, repos, links).
import { useId, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

/** A caption (optional) above a rounded group of cells. The caption names the group for assistive technology. */
export function Group({ caption, testId, children }: { caption?: ReactNode; testId?: string; children: ReactNode }) {
  const id = useId();
  return (
    <>
      {caption ? (
        <p className="group-cap" id={id}>
          {caption}
        </p>
      ) : null}
      <div className="group" role="group" aria-labelledby={caption ? id : undefined} data-testid={testId}>
        {children}
      </div>
    </>
  );
}

export type CellProps = {
  title: ReactNode;
  /** The title in body size and regular weight, as a settings row (`is-plain`). */
  plain?: boolean;
  /** A line under the title. */
  meta?: ReactNode;
  /** The meta line is a path, an address or a number: the data font. */
  metaData?: boolean;
  /** A value at the trailing edge. */
  value?: ReactNode;
  valueData?: boolean;
  /** A dot before the value: the state it names. */
  dot?: 'ok' | 'run' | 'fail' | 'warn' | 'idle';
  testId?: string;
  /** Show the chevron of a cell that opens a page; the caller makes the cell a link or a button with `as`. */
  chevron?: boolean;
};

const DOT: Record<NonNullable<CellProps['dot']>, string | false> = { ok: 'd-ok', run: 'd-run', fail: 'd-fail', warn: 'd-warn', idle: false };

/** One row of a group. A static row is a `div`; a row that opens something is built by the caller around the same classes. */
export function Cell({ title, plain, meta, metaData, value, valueData, dot, testId, chevron }: CellProps) {
  return (
    <div className="cell" data-testid={testId}>
      <span className="cell-main">
        <span className={cx('cell-title', plain && 'is-plain')}>{title}</span>
        {meta ? <span className={cx('cell-meta', metaData && 'is-data')}>{meta}</span> : null}
      </span>
      {value !== undefined ? (
        <span className={cx('cell-value', valueData && 'is-data')}>
          {dot ? <span className={cx('dot', DOT[dot])} /> : null}
          {value}
        </span>
      ) : null}
      {chevron ? <Icon name="chev" className="chev" /> : null}
    </div>
  );
}
