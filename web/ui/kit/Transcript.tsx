// The transcript of a session (`.tx`, dark in both themes): a bar (how many entries on the left, its state on the right), then one
// entry per block (`.tx-entry`): its time and kind as a head, then its body. On the phone each entry is a block; from 1024px the head
// sits beside the body (design/ds/components.css). The screen gives the text of every entry; the kit knows no i18n and no business.
//
// Scrolling (from 640px the entries scroll inside the frame): stick to the bottom while the viewer has not scrolled up; scrolling up
// near the top (or wheeling up while already at the top: a frame that is not full has no scroll event) calls `onNearTop`, and entries
// inserted on top keep the reading position.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export type TranscriptEntry = {
  key: string;
  /** `data-cursor` (`<offset>:<block>`): the tests count entries and measure when they appeared. */
  cursor: string;
  /** `data-at` (ISO): the tests compare it with the `timestamp` of the JSONL line. */
  at: string | null;
  /** `data-kind`: the kind of the block (user, assistant, thinking, tool_use, tool_result, system). */
  kind: string;
  /** The colour of the kind's label. */
  tone?: 'think' | 'assistant' | 'tool';
  err?: boolean;
  time: string;
  label: ReactNode;
  body: ReactNode;
};

const TONE = { think: 'k-think', assistant: 'k-assistant', tool: 'k-tool' } as const;

/** How many px from the top counts as "near the top". */
const NEAR_TOP = 80;

/** The text of an entry (`.tx-body`): `code` in the data font, `think` dimmed and italic. */
export function TxBody({ variant, children }: { variant?: 'code' | 'think'; children: ReactNode }) {
  return <div className={cx('tx-body', variant === 'code' && 'is-code', variant === 'think' && 'is-think')}>{children}</div>;
}

/** A folded part of an entry: the button says what is folded; pressing it shows `children` under it. */
export function TxFold({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="tx-fold" type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="chev" />
        {label}
      </button>
      {open ? children : null}
    </>
  );
}

export function Transcript({
  testId,
  left,
  right,
  entries,
  top,
  end,
  live,
  onNearTop,
}: {
  testId?: string;
  left: ReactNode;
  right: ReactNode;
  entries: readonly TranscriptEntry[];
  /** A line above the entries (older entries are loading); null = none. */
  top: ReactNode;
  /** The line under the last entry of an ended session. */
  end?: ReactNode;
  /** A live session: a cursor at `at` after the last entry; `paused` while the connection is lost. */
  live?: { at: string; paused: boolean };
  onNearTop?: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  /** scrollTop set by the component itself: the scroll event of that set is not the viewer scrolling. */
  const setTop = useRef(-1);
  const prev = useRef<{ first: string | null; height: number }>({ first: null, height: 0 });
  const near = useRef(onNearTop);
  near.current = onNearTop;
  const place = (el: HTMLDivElement, at: number) => {
    el.scrollTop = at;
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
    const first = entries[0]?.key ?? null;
    const p = prev.current;
    if (p.first !== null && first !== p.first && entries.some((e) => e.key === p.first)) {
      place(el, el.scrollTop + (el.scrollHeight - p.height)); // older entries inserted on top: keep the reading position
    } else if (stick.current) {
      place(el, el.scrollHeight);
    }
    prev.current = { first, height: el.scrollHeight };
  }, [entries, live, top]);
  // A native, non-passive wheel listener on the frame itself: Chromium sends no wheel to a passive one when nothing can scroll.
  // The browser's own scroll anchoring is off: inserting on top keeps its place above.
  useEffect(() => {
    const el = scroll.current;
    if (!el) return undefined;
    el.style.overflowAnchor = 'none';
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && el.scrollTop < NEAR_TOP) near.current?.();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  // A font that loads changes the text height: stick to the bottom again.
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
  const edge = (id: boolean) => (testId && id ? `${testId}-edge` : undefined);
  return (
    <div className="tx" data-testid={testId} data-paused={String(live?.paused ?? false)}>
      <div className="tx-bar">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="tx-scroll" ref={scroll} onScroll={onScroll} data-raw="" data-testid={testId ? `${testId}-scroll` : undefined}>
        {top !== null ? (
          <div className="tx-end" data-testid={edge(true)}>
            {top}
          </div>
        ) : null}
        {entries.map((e) => (
          <div
            key={e.key}
            className={cx('tx-entry', e.tone && TONE[e.tone], e.err && 'is-err')}
            data-testid="tx-entry"
            data-cursor={e.cursor}
            data-at={e.at ?? undefined}
            data-kind={e.kind}
          >
            <div className="tx-head">
              <span>{e.time}</span>
              <span className="tx-kind">{e.label}</span>
            </div>
            {e.body}
          </div>
        ))}
        {live ? (
          <div className="tx-entry">
            <div className="tx-head">
              <span>{live.at}</span>
            </div>
            <div className="tx-body">
              <span className="cursor" />
            </div>
          </div>
        ) : end !== undefined ? (
          <div className="tx-end" data-testid={edge(top === null)}>
            {end}
          </div>
        ) : null}
      </div>
    </div>
  );
}
