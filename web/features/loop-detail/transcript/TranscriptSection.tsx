// Transcript section of the run screen (the transcript screen · the approved preview `run-transcript-*`, D-UI27...D-UI33): the verbatim JSONL file Claude Code
// writes, read through the API (no copy is stored). Running -> stick to the bottom, new entries appear gradually; finished -> the last page, scrolling up loads older ones by itself.
// The text in the transcript is data (`data-raw` on the frame) - it does not go through i18n.
import type { ReactNode } from 'react';
import type { RunDto } from '../../../../shared/contracts/loops';
import type { TranscriptEntryDto } from '../../../../shared/contracts/transcript';
import type { UseTranscript } from '../../../data/transcript';
import { fmtNumber, fmtTime } from '../../../prefs/format';
import { useT } from '../../../prefs/prefs';
import { SectionTitle } from '../../../ui/components';
import { TranscriptView, type TranscriptViewRow } from '../../../ui/TranscriptView';
import { RunTag } from '../parts';
import { fieldsText, firstLine, shouldFold, toolFields, toolSubject, TX_GLYPH, txSize } from './entry-format';

export function TranscriptSection({ run, tx, tz }: { run: RunDto; tx: UseTranscript; tz: string }) {
  const t = useT();
  const live = run.status === 'running';
  const note = (glyph: string, mode: string, text: ReactNode) => (
    <div className="note" data-testid="run-transcript-note" data-mode={mode}>
      <span className="glyph">{glyph}</span>
      <span className="txt">{text}</span>
    </div>
  );
  let body: ReactNode;
  if (tx.mode === 'noSession') body = note('↷', 'noSession', t('tx.noSession'));
  else if (tx.mode === 'missing' && live) body = note('◌', 'waiting', t('tx.waiting'));
  else if (tx.mode === 'missing') body = note('∅', 'missing', t.node('tx.missing', { id: <span className="mono">{run.sessionId ?? ''}</span> }));
  else {
    const paused = live && tx.mode === 'paused';
    body = (
      <TranscriptView
        testId="run-transcript"
        left={live ? t('tx.live', { id: run.sessionId ?? '—' }) : t('tx.saved', { n: tx.entries.length })}
        right={live ? (paused ? t('log.paused') : t('log.following')) : <RunTag status={run.status} boxed={false} />}
        rows={tx.entries.map((e) => toRow(e, t, tz))}
        edge={tx.start === null ? null : tx.hasMore ? t('tx.loadingOlder') : t('tx.start')}
        live={live}
        paused={paused}
        onNearTop={tx.loadOlder}
      />
    );
  }
  return (
    <>
      <SectionTitle title={t('section.transcript')} extra={tx.mode === 'noSession' ? undefined : t('tx.hint')} testId="run-transcript-title" />
      {body}
    </>
  );
}

type T = ReturnType<typeof useT>;

function toRow(e: TranscriptEntryDto, t: T, tz: string): TranscriptViewRow {
  const base = { key: `${e.offset}:${e.block}`, cursor: `${e.offset}:${e.block}`, at: e.at, kind: e.kind, time: e.at ? fmtTime(new Date(e.at), tz) : '—', glyph: TX_GLYPH[e.kind] };
  switch (e.kind) {
    case 'user':
      return { ...base, label: t('tx.kind.user'), body: <Fold t={t} text={e.text} always /> };
    case 'assistant':
      return { ...base, label: t('tx.kind.assistant'), bodyClass: 'is-prose', body: e.text };
    case 'thinking':
      return { ...base, label: t('tx.kind.thinking'), bodyClass: 'is-think', body: e.text.trim() ? e.text : t('tx.thinking.empty') };
    case 'tool_use':
      return {
        ...base,
        label: t('tx.kind.tool_use', { name: e.toolName ?? '' }),
        body: (
          <>
            <span className="tx-subj">{toolSubject(e.text)}</span>
            <div className="tx-input">
              <ToolInput t={t} json={e.text} />
            </div>
          </>
        ),
      };
    case 'tool_result':
      return { ...base, err: e.isError === true, label: e.isError ? t('tx.kind.tool_error') : t('tx.kind.tool_result'), body: <Fold t={t} text={e.text} /> };
    case 'system':
      return { ...base, label: t('tx.kind.system'), bodyClass: 'is-sys', body: e.text };
  }
}

/** Fold with `<details>` when long (D-UI29) - fold, not cut; `children` = how to draw (empty: `text` itself). */
function Fold({ t, text, always, children }: { t: T; text: string; always?: boolean; children?: ReactNode }) {
  const body = <div className="tx-pre">{children ?? text}</div>;
  if (!shouldFold(text, always)) return body;
  return (
    <details className="tx-fold">
      <summary>
        <span className="tx-first">{firstLine(text)}</span>
        <span className="tx-meta">{t('tx.fold', { n: fmtNumber(t.lang, text.split('\n').length), size: txSize(text, t.lang) })}</span>
      </summary>
      {body}
    </details>
  );
}

function ToolInput({ t, json }: { t: T; json: string }) {
  const fields = toolFields(json);
  if (!fields) return <Fold t={t} text={json} />;
  return (
    <Fold t={t} text={fieldsText(fields)}>
      {fields.map(([k, v]) => (
        <div className="tx-field" key={k}>
          <span className="tx-fk">{k}:</span>
          {'\n'}
          {v}
        </div>
      ))}
    </Fold>
  );
}
