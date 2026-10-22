// TranscriptView - the Transcript frame of the design system (D-UI27...D-UI31: `.log.tx`, `.tx-row`, `.tx-edge` in
// design/components.css), exactly the structure the preview draws (design/preview/preview.js -> transcriptView). Shell = LogView: top bar,
// dark scroll frame, a blinking cursor while following live, faded when the connection is lost. No business knowledge, no i18n:
// the time, the label and the content of each entry come from the screen.
//
// Scrolling: stick to the bottom like LogView (if the viewer scrolled up, stay put); scrolling up near the top (or wheeling up while already at the top - a frame
// that is not full has no scroll event) -> `onNearTop` (the screen loads an older page); entries inserted on top keep the reading position.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cx } from './components';

export type TranscriptViewRow = {
  key: string;
  /** `data-cursor` (`<offset>:<block>`) - e2e counts entries and measures when they appeared. */
  cursor: string;
  /** `data-at` (ISO) - e2e compares the time it appeared with the `timestamp` of the JSONL line. */
  at: string | null;
  /** Class `k-<kind>` (label color). */
  kind: string;
  err?: boolean;
  /** Time printed in the left column (`HH:MM:SS`). */
  time: string;
  glyph: string;
  label: ReactNode;
  /** Extra class for the content cell (`is-prose`, `is-think`, `is-sys`). */
  bodyClass?: string;
  body: ReactNode;
};

/** How many px from the top counts as "near the top". */
const NEAR_TOP = 80;

export function TranscriptView({ left, right, rows, edge, live, paused, onNearTop, testId }: {
  left: ReactNode;
  right: ReactNode;
  rows: readonly TranscriptViewRow[];
  /** Faded line at the top: "loading older..." / "— start of transcript —"; null = none. */
  edge: ReactNode;
  live?: boolean;
  paused?: boolean;
  onNearTop?: () => void;
  testId?: string;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  /** scrollTop set by the component itself - the scroll event of that set is not the viewer scrolling. */
  const setTop = useRef(-1);
  const prev = useRef<{ first: string | null; height: number }>({ first: null, height: 0 });
  const near = useRef(onNearTop);
  near.current = onNearTop;
  const place = (el: HTMLDivElement, top: number) => {
    el.scrollTop = top;
    setTop.current = el.scrollTop;
  };
  const onScroll = () => {
    const el = scroll.current;
    if (!el || Math.abs(el.scrollTop - setTop.current) < 2) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
    if (el.scrollTop < NEAR_TOP) near.current?.();
  };
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const first = rows[0]?.key ?? null;
    const p = prev.current;
    if (p.first !== null && first !== p.first && rows.some((r) => r.key === p.first)) {
      place(el, el.scrollTop + (el.scrollHeight - p.height)); // older entries inserted on top: keep the reading position
    } else if (stick.current) {
      place(el, el.scrollHeight);
    }
    prev.current = { first, height: el.scrollHeight };
  }, [rows, live, edge]);
  // Wheel up while already at the top (a frame that is not full has no scroll event). A NATIVE, non-passive listener on the frame itself:
  // with only React's onWheel (passive, attached at the page root) or a passive listener, Chromium sends no wheel at all when the frame and
  // the page cannot scroll (measured while building the e2e of UC-27, 20/10/2026). It does not call preventDefault - scrolling stays normal.
  useEffect(() => {
    const el = scroll.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && el.scrollTop < NEAR_TOP) near.current?.();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  // Font loaded changes the text height -> if sticking to the bottom, stick again (the preview does the same).
  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => {
      const el = scroll.current;
      if (!alive || !el || !stick.current) return;
      place(el, el.scrollHeight);
      prev.current = { ...prev.current, height: el.scrollHeight };
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className={cx('log', 'tx', paused && 'is-paused')} data-testid={testId} data-paused={paused ? 'true' : 'false'}>
      <div className="log-bar">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      {/* overflow-anchor: none - keeps its place itself on insert-on-top (the browser's scroll anchor would compensate a second time) */}
      <div className="log-scroll" ref={scroll} onScroll={onScroll} style={{ overflowAnchor: 'none' }} data-raw="" data-testid={testId ? `${testId}-scroll` : undefined}>
        {edge !== null && <div className="tx-edge" data-testid={testId ? `${testId}-edge` : undefined}>{edge}</div>}
        {rows.map((r) => (
          <div key={r.key} className={cx('tx-row', `k-${r.kind}`, r.err && 'is-err')} data-cursor={r.cursor} data-at={r.at ?? undefined} data-kind={r.kind}>
            <span className="t">{r.time}</span>
            <span className="tx-k">
              <span className="g">{r.glyph}</span>
              {r.label}
            </span>
            <div className={cx('tx-b', r.bodyClass)}>{r.body}</div>
          </div>
        ))}
        {live && (
          <div className="tx-row">
            <span className="t" />
            <span className="tx-k" />
            <div className="tx-b">
              <span className="cursor" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
