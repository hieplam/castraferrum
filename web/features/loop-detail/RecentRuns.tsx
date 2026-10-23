// Recent runs of the loop page (spec 5.3, D6): the current (or latest) active period with up to 4 runs and "Show N more runs from
// this period", then the earlier periods as cells. The `?` explains the words (a popover on the desktop, a sheet on the phone);
// the desktop's head links to All runs. The current period's head opens its active period page, as the earlier periods' cells do.
// Nothing shows before the loop's first Start.
import { Fragment } from 'react';
import { Link } from 'react-router';
import type { LoopDetailDto } from '../../../shared/contracts/loops';
import { useLoopExecutions, useLoopRuns } from '../../data/history';
import { useT } from '../../prefs/prefs';
import { Icon } from '../../ui/kit/Icon';
import { useLayout } from '../../ui/kit/Layout';
import { Toggletip } from '../../ui/kit/Overlay';
import { groupRuns, type PeriodSummary } from './group-runs';
import { HelpContent } from './HelpContent';
import { periodCountsText, periodEndText, periodSpanText } from './period-text';
import { RunCell } from './RunCell';

/** Runs asked for to fill the current period (the newest ones of the loop). */
const RUNS_ASKED = 20;

/** An earlier active period as a cell: its number, its span, how it ended, its runs. It opens the active period page. */
export function PeriodCell({ period, tz, now }: { period: PeriodSummary; tz: string; now: Date }) {
  const t = useT();
  return (
    <Link className="cell" to={`/executions/${period.executionId}`} data-testid="period-row" data-execution-id={period.executionId}>
      <span className="cell-main">
        <span className="cell-title">{t('period.title', { k: period.seq ?? '?' })}</span>
        <span className="cell-meta">
          {`${periodSpanText(t, period, tz, now)} · ${periodEndText(t, period)} · ${periodCountsText(t.tn, period.runs, period.failures)}`}
        </span>
      </span>
      <Icon name="chev" className="chev" />
    </Link>
  );
}

export function RecentRuns({ loop, now }: { loop: LoopDetailDto; now: Date }) {
  const t = useT();
  const phone = useLayout() === 'phone';
  const executions = useLoopExecutions(loop.id);
  const runs = useLoopRuns(loop.id, RUNS_ASKED);
  if (!loop.currentExecution || !executions.data || !runs.data) return null;
  const { current, earlier } = groupRuns(runs.data.pages[0]?.items ?? [], executions.data.pages.flatMap((p) => p.items));
  if (!current) return null;
  const tz = loop.timezone;
  return (
    <>
      <div className="section-head">
        <h2>{t('runs.title')}</h2>
        <Toggletip label={t('runs.help')} title={t('help.title')} closeLabel={t('help.close')} testId="runs-help" sheetTestId="help-sheet">
          <HelpContent />
        </Toggletip>
        {phone ? null : (
          <Link className="link" to={`/loops/${loop.id}/runs`} data-testid="all-runs-link">
            {t.tn('runs.all', loop.runCount)}
            <Icon name="arrow" />
          </Link>
        )}
      </div>
      <p className="group-cap" data-execution-id={current.executionId}>
        <Link className="link" to={`/executions/${current.executionId}`}>
          {t('period.title', { k: current.seq ?? '?' })}
        </Link>
        {[periodSpanText(t, current, tz, now), periodEndText(t, current), t.tn('period.runs', current.runs)].map((part, i) => (
          <Fragment key={i}>
            {' '}
            <span className="keep">{`· ${part}`}</span>
          </Fragment>
        ))}
      </p>
      <div className="group" data-testid="recent-runs">
        {current.items.map((r) => (
          <RunCell key={r.id} run={r} tz={tz} now={now} />
        ))}
        {current.rest > 0 ? (
          <Link className="cell is-link" to={`/executions/${current.executionId}`}>
            {t.tn('runs.showMore', current.rest)}
          </Link>
        ) : null}
      </div>
      {earlier.length ? (
        <>
          <p className="group-cap">{t('runs.earlier')}</p>
          <div className="group">
            {earlier.map((p) => (
              <PeriodCell key={p.executionId} period={p} tz={tz} now={now} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
