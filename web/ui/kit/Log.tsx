// The output of a run (`.log`, dark in both themes): a bar (what it is on the left, its state on the right) and the lines, each with
// its time. A live log ends with a cursor at now and says whether it follows or waits to reconnect (`data-paused`).
import type { ReactNode } from 'react';

/** `time` is empty for a line that has none (the output of a gate step is a stored tail with no times). */
export type LogLine = { seq: number; time?: string; tone?: 'head' | 'ok' | 'err'; text: string };

const TONE = { head: 'log-head', ok: 'log-ok', err: 'log-err' } as const;

export function Log({
  testId,
  left,
  right,
  lines,
  live,
}: {
  testId?: string;
  left: ReactNode;
  right?: ReactNode;
  lines: readonly LogLine[];
  /** A live log: the cursor after the last line at `at`; `paused` while the connection is lost. */
  live?: { at: string; paused: boolean };
}) {
  return (
    <div className="log" data-testid={testId} data-paused={live ? String(live.paused) : undefined}>
      <div className="log-bar">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="log-scroll">
        {lines.map((l) => (
          <span className="log-line" data-seq={l.seq} key={l.seq}>
            {l.time ? <span className="log-time">{l.time}</span> : null}
            {l.tone ? <span className={TONE[l.tone]}>{l.text}</span> : l.text}
          </span>
        ))}
        {live ? (
          <span className="log-line">
            <span className="log-time">{live.at}</span>
            <span className="cursor" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
