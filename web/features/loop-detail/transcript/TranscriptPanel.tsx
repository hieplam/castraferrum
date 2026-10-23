// The Transcript section of the new run page (spec 5.5): the verbatim JSONL file Claude Code writes, read through the API (no copy
// is kept). A running run follows the file live; an ended run shows its last page, and scrolling up loads older pages. One entry per
// block: the prompt is always folded (it is shown in full under Prompt used), a tool call shows its subject and folds the rest of
// its input, a result longer than two lines shows its first line and folds the rest (the rules of the approved preview, txEntry).
// Without a transcript the section says why: no session, Claude has not written the file yet, or the file is gone.
import type { RunDto } from '../../../../shared/contracts/loops';
import type { TranscriptEntryDto } from '../../../../shared/contracts/transcript';
import type { UseTranscript } from '../../../data/transcript';
import { fmtTime } from '../../../prefs/format';
import { useT } from '../../../prefs/prefs';
import { Toggletip } from '../../../ui/kit/Overlay';
import { Transcript, TxBody, TxFold, type TranscriptEntry } from '../../../ui/kit/Transcript';
import { cursorTime, runEndedAt } from '../format';
import { fieldsText, firstLine, toolFields } from './entry-format';

type T = ReturnType<typeof useT>;

/** The field that names a tool call, in this order, then any string field (D-UI29). */
const SUBJECT = ['command', 'file_path', 'pattern', 'description', 'url', 'prompt', 'query'];

const lineCount = (text: string) => text.split('\n').length;

function toolBody(t: T, json: string) {
  let o: Record<string, unknown> | null = null;
  try {
    const v: unknown = JSON.parse(json);
    o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    o = null;
  }
  const keys = o ? Object.keys(o) : [];
  const subjectKey = o ? (SUBJECT.find((k) => typeof o[k] === 'string') ?? keys.find((k) => typeof o[k] === 'string')) : undefined;
  const subject = o && subjectKey ? firstLine(o[subjectKey] as string) : json;
  const rest = keys.filter((k) => k !== subjectKey && k !== 'description');
  const fields = toolFields(json);
  const all = fields ? fieldsText(fields) : json;
  return (
    <>
      <TxBody variant="code">{subject}</TxBody>
      {rest.length ? (
        <TxFold label={t.tn('tx.input', lineCount(all))}>
          <TxBody variant="code">{all}</TxBody>
        </TxFold>
      ) : null}
    </>
  );
}

function toEntry(t: T, e: TranscriptEntryDto, tz: string): TranscriptEntry {
  const base = { key: `${e.offset}:${e.block}`, cursor: `${e.offset}:${e.block}`, at: e.at, kind: e.kind, time: e.at ? fmtTime(new Date(e.at), tz) : '-' };
  switch (e.kind) {
    case 'user':
      return {
        ...base,
        label: t('tx.prompt'),
        body: (
          <TxFold label={`${firstLine(e.text)} · ${t.tn('tx.lines', lineCount(e.text))}`}>
            <TxBody variant="code">{e.text}</TxBody>
          </TxFold>
        ),
      };
    case 'thinking':
      return { ...base, tone: 'think', label: t('tx.thinking'), body: <TxBody variant="think">{e.text.trim() ? e.text : t('tx.thinkingEmpty')}</TxBody> };
    case 'assistant':
      return { ...base, tone: 'assistant', label: t('tx.assistant'), body: <TxBody>{e.text}</TxBody> };
    case 'tool_use':
      return { ...base, tone: 'tool', label: t('tx.tool', { name: e.toolName ?? '' }), body: toolBody(t, e.text) };
    case 'tool_result': {
      const lines = e.text.split('\n');
      const long = lines.length > 2;
      return {
        ...base,
        err: e.isError === true,
        label: t('tx.result'),
        body: (
          <>
            <TxBody variant="code">{long ? lines[0] : e.text}</TxBody>
            {long ? (
              <TxFold label={t.tn('tx.more', lines.length - 1)}>
                <TxBody variant="code">{lines.slice(1).join('\n')}</TxBody>
              </TxFold>
            ) : null}
          </>
        ),
      };
    }
    case 'system':
      return { ...base, label: t('tx.kind.system'), body: <TxBody>{e.text}</TxBody> };
  }
}

export function TranscriptPanel({ run, tx, tz, now, offline }: { run: RunDto; tx: UseTranscript; tz: string; now: Date; offline: boolean }) {
  const t = useT();
  const live = run.status === 'running';
  const head = (
    <div className="section-head">
      <h2 data-testid="run-transcript-title">{t('run.transcript')}</h2>
      <Toggletip label={t('tx.help')} title={t('run.transcript')} closeLabel={t('help.close')}>
        <p className="page-desc">{t('tx.hint')}</p>
      </Toggletip>
    </div>
  );
  const note = (mode: string, text: string) => (
    <p className="note" data-testid="run-transcript-note" data-mode={mode}>
      {text}
    </p>
  );
  if (tx.mode === 'noSession')
    return (
      <>
        {head}
        {note('noSession', t('tx.note.noSession'))}
      </>
    );
  if (tx.mode === 'missing')
    return (
      <>
        {head}
        {live ? note('waiting', t('tx.note.waiting')) : note('missing', t('tx.note.missing', { id: run.sessionId ?? '' }))}
      </>
    );
  const paused = live && (tx.mode === 'paused' || offline);
  const ended = runEndedAt(run);
  return (
    <>
      {head}
      <Transcript
        testId="run-transcript"
        left={t.tn('tx.entries', tx.entries.length)}
        right={live ? t(paused ? 'now.paused' : 'now.following') : t('tx.ended')}
        entries={tx.entries.map((e) => toEntry(t, e, tz))}
        top={tx.hasMore ? t('tx.loadingOlderEntries') : null}
        end={ended ? t('tx.end', { t: fmtTime(ended, tz) }) : undefined}
        live={live ? { at: cursorTime(now, tz), paused } : undefined}
        onNearTop={tx.loadOlder}
      />
    </>
  );
}
