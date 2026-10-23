// Settings and prompt of one loop (spec 5.3, `/loops/:id/settings`): repo with its path, schedule with its time zone, agent, runs
// at the same time, time limit, and the full prompt; Edit settings is the page's main action (the action bar on the phone, the
// head from 640px). The loop page's side card shows the same settings compactly with the prompt cut after five lines.
import { Link, useNavigate } from 'react-router';
import type { LoopDetailDto } from '../../../shared/contracts/loops';
import { useLoop } from '../../data/loops';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Button } from '../../ui/kit/Button';
import { Cell } from '../../ui/kit/Group';
import { ActionBar, PageHead, useLayout } from '../../ui/kit/Layout';
import { executorSummary, fmtSpan, scheduleSentence } from './format';
import { errorTitle, PageNotFound, PageSkeleton, PushedPage } from './PushedPage';

/** One setting. Each text is one string, so it is drawn as one run of text. */
type Row = { testId?: string; label: MessageKey; value: string; meta?: string };

function useRows(loop: LoopDetailDto): Row[] {
  const t = useT();
  return [
    { testId: 'config-repo', label: 'loopSettings.repo', value: loop.repo.name, meta: loop.repo.path },
    { label: 'loopSettings.schedule', value: scheduleSentence(loop.cron, t.lang), meta: loop.timezone },
    { testId: 'config-executor', label: 'loopSettings.agent', value: executorSummary(t, loop.executor.kind, loop.executor.config) },
    { testId: 'config-concurrent', label: 'loopSettings.parallel', value: t('loopSettings.atMost', { n: loop.maxConcurrent }) },
    { testId: 'config-timeout', label: 'loopSettings.limit', value: loop.timeoutSec === null ? t('loopSettings.noLimit') : fmtSpan(t, loop.timeoutSec) },
  ];
}

/** The side card of the loop page (from 1024px): compact definitions, the prompt cut after five lines, Edit settings. */
export function SettingsCard({ loop }: { loop: LoopDetailDto }) {
  const t = useT();
  const navigate = useNavigate();
  const rows = useRows(loop);
  return (
    <div className="card is-pad">
      <div className="section-head">
        <h2>{t('loopSettings.title')}</h2>
      </div>
      {rows.map((r) => (
        <div className="def is-compact" data-testid={r.testId} key={r.label}>
          <b>{t(r.label)}</b>
          {r.testId === 'config-repo' ? (
            <>
              <strong data-raw="">{r.value}</strong>
              {r.meta ? (
                <span className="data" data-raw="">
                  {r.meta}
                </span>
              ) : null}
            </>
          ) : (
            <span>{r.meta ? `${r.value} · ${r.meta}` : r.value}</span>
          )}
        </div>
      ))}
      <div className="def is-compact">
        <b>{t('loopSettings.prompt')}</b>
        <pre className="code is-clamped" data-raw="" data-testid="loop-prompt">
          {loop.prompt}
        </pre>
      </div>
      <Link className="link" to={`/loops/${loop.id}/settings`} data-testid="loop-prompt-full">
        {t('loopSettings.fullPrompt')}
      </Link>
      <Button block onClick={() => navigate(`/loops/${loop.id}/edit`)}>
        {t('loopSettings.edit')}
      </Button>
    </div>
  );
}

function SettingsBody({ loop }: { loop: LoopDetailDto }) {
  const t = useT();
  const navigate = useNavigate();
  const phone = useLayout() === 'phone';
  const rows = useRows(loop);
  const edit = (
    <Button variant="primary" size={phone ? 'lg' : undefined} block={phone} onClick={() => navigate(`/loops/${loop.id}/edit`)} data-testid="loop-edit">
      {t('loopSettings.edit')}
    </Button>
  );
  return (
    <PushedPage back={{ to: `/loops/${loop.id}`, label: <span data-raw="">{loop.name}</span> }} narrow testId="loop-settings-page">
      <PageHead title={t('loopSettings.title')}>{phone ? null : edit}</PageHead>
      <div className="group">
        {rows.map((r) => (
          <Cell key={r.label} testId={r.testId} title={t(r.label)} plain meta={r.meta} value={r.testId === 'config-repo' ? <span data-raw="">{r.value}</span> : r.value} />
        ))}
      </div>
      <p className="group-cap">{t('loopSettings.prompt')}</p>
      <pre className="code" data-raw="" data-testid="loop-prompt">
        {loop.prompt}
      </pre>
      {phone ? <ActionBar>{edit}</ActionBar> : null}
    </PushedPage>
  );
}

export function LoopSettingsView({ id }: { id: string }) {
  const t = useT();
  const q = useLoop(id);
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <PageNotFound title={errorTitle(t, q.error, 'error.LOOP_NOT_FOUND')} />;
  return <SettingsBody loop={q.data} />;
}
