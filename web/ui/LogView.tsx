// LogView - the dark-background log block of the design system (`.log`, `.log-bar`, `.log-scroll`, `.cursor` in design/components.css),
// exactly the structure the approved preview draws (design/preview/preview.js -> logView). No business knowledge, no i18n: the top bar text,
// the time of each line, the color of each line (`tone`) come from the screen. The log is data the executor wrote (D-UI8) -> `data-raw`.
//
// Stick to the bottom: when at the bottom (or just drawn for the first time) a new line scrolls down with it; if the viewer scrolled up to read it stays put.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cx } from './components';

export type LogViewLine = {
  key: string | number;
  /** Time printed in the left column (`HH:MM:SS`). */
  time: string;
  /** `head` = the opening line, `ok` = done, `err` = error; empty = plain text. */
  tone?: 'head' | 'ok' | 'err';
  text: ReactNode;
  /** Goes into `data-seq` (e2e measures when the line appeared). */
  seq?: number;
};

export function LogView({ left, right, lines, live, cursorAt, paused, testId }: {
  left: ReactNode;
  right: ReactNode;
  lines: readonly LogViewLine[];
  /** Following live: add a blinking cursor line at the end. */
  live?: boolean;
  /** Time printed before the cursor. */
  cursorAt?: string;
  /** Connection lost: the log fades, the cursor is hidden (`.log.is-paused`). */
  paused?: boolean;
  testId?: string;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  /** scrollTop set by the component itself - the scroll event of that set is not the viewer scrolling. */
  const setTop = useRef(-1);
  const onScroll = () => {
    const el = scroll.current;
    if (!el || Math.abs(el.scrollTop - setTop.current) < 2) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
  };
  useLayoutEffect(() => {
    const el = scroll.current;
    if (el && stick.current) {
      el.scrollTop = el.scrollHeight;
      setTop.current = el.scrollTop;
    }
  }, [lines.length, live]);
  return (
    <div className={cx('log', paused && 'is-paused')} data-testid={testId} data-paused={paused ? 'true' : 'false'}>
      <div className="log-bar">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="log-scroll" ref={scroll} onScroll={onScroll} data-raw="">
        {lines.map((l) => (
          <div key={l.key} data-seq={l.seq}>
            <span className="t">{l.time}</span>
            {l.tone ? <span className={`lv-${l.tone}`}>{l.text}</span> : l.text}
          </div>
        ))}
        {live && (
          <div>
            <span className="t">{cursorAt ?? ''}</span>
            <span className="cursor" />
          </div>
        )}
      </div>
    </div>
  );
}
