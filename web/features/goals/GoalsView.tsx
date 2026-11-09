// The goals page of a loop (goal G11, preview state `goal-rows`): the goal number, the rows of the manifest that pass and fail, the standing
// goals and the loops whose probe failed. A page pushed from the loop page: the phone keeps the tab bar under the navigation bar.
// Every number, state and text comes from `GET /api/loops/:id/goals`; the page only formats it.
import { Link } from 'react-router';
import type { GoalLoopDto, GoalRowDto, GoalViewDto, StandingRowDto } from '../../../shared/contracts/goals';
import { useLoop } from '../../data/loops';
import { useGoalView } from '../../data/goals';
import { fmtDateTime, fmtNumber, fmtTime } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { Group, RowCell } from '../../ui/kit/Group';
import { Icon } from '../../ui/kit/Icon';
import { PageHead } from '../../ui/kit/Layout';
import { Pill } from '../../ui/kit/Pill';
import { Stat, Stats } from '../loop-detail/Figures';
import { errorTitle, PageNotFound, PageSkeleton, PushedPage } from '../loop-detail/PushedPage';

type TFn = ReturnType<typeof useT>;
const data = (text: string) => <span className="data">{text}</span>;

/** `dd/mm HH:MM` in the time zone of the loop. */
const dayTime = (at: Date, tz: string) => fmtDateTime(at, tz).slice(0, -3);

/** A goal row or a standing row: its id, a pill, the line of its last result, the text of the goal and, for a standing row, its issue. */
function ResultCell({ testId, id, pass, line, text, issue, t }: { testId: string; id: string; pass: boolean; line: string; text: string; issue?: number | null; t: TFn }) {
  return (
    <RowCell testId={testId} data={{ 'data-status': pass ? 'pass' : 'fail' }}>
      <span className="cell-main">
        <span className="run-top">
          <span className="run-id">{id}</span>
          {pass ? <Pill tone="ok">{t('goalLoop.loop.complete')}</Pill> : <Pill tone="fail">{t('goalLoop.gate.failed')}</Pill>}
          <span className="run-meta">{line}</span>
        </span>
        <span className="cell-sum">{text}</span>
        {issue ? <span className="cell-meta">{t('goalLoop.goals.issue', { n: issue })}</span> : null}
      </span>
    </RowCell>
  );
}

/** What the page says about the last failure of a standing row: when it failed last while it passes, since when it fails while it fails. */
function standingLine(row: StandingRowDto, tz: string, t: TFn): string {
  if (row.pass) return row.lastFailedAt ? t('goalLoop.goals.lastFailed', { t: dayTime(row.lastFailedAt, tz) }) : '';
  return row.openSince ? t('goalLoop.goals.failingSince', { t: dayTime(row.openSince, tz) }) : '';
}

function LoopCell({ loop, t }: { loop: GoalLoopDto; t: TFn }) {
  return (
    <Link className="cell" to={`/loops/${loop.id}`} data-testid="goal-loop-row" data-status={loop.state}>
      <span className="cell-main">
        <span className="cell-title" data-raw="">
          {loop.name}
        </span>
        <span className="cell-row">
          {loop.state === 'budget_limited' ? <Pill tone="warn">{t('goalLoop.loop.budgetLimited')}</Pill> : <Pill tone="fail">{t('goalLoop.loop.probeFailed')}</Pill>}
          <span className="cell-meta">
            {loop.state === 'budget_limited'
              ? t('goalLoop.goals.budget', { used: fmtNumber(t.lang, loop.used), budget: fmtNumber(t.lang, loop.budget ?? 0) })
              : t('goalLoop.goals.probeStopped', { text: loop.text ?? '' })}
          </span>
        </span>
      </span>
      <Icon name="chev" className="chev" />
    </Link>
  );
}

function Body({ view, tz, t }: { view: GoalViewDto; tz: string; t: TFn }) {
  const opened = view.opened;
  const openedAt = opened ? new Date(opened.at) : null;
  return (
    <>
      <Stats testId="goal-figures">
        <Stat label={t('goalLoop.goals.figure')} value={`${view.passed}/${view.total}`} sub={t('goalLoop.goals.figureSub')} />
        <Stat label={t('goalLoop.goals.failing')} value={view.total - view.passed} sub={t('goalLoop.goals.failingSub')} />
        <Stat
          label={t('goalLoop.goals.opened')}
          value={opened ? `${opened.passed}/${opened.total}` : '-'}
          sub={openedAt && !Number.isNaN(openedAt.getTime()) ? t('goalLoop.goals.openedSub', { t: fmtDateTime(openedAt, tz).slice(0, 5) }) : undefined}
        />
        <Stat
          label={t('goalLoop.goals.checked')}
          value={view.checkedAt ? fmtTime(view.checkedAt, tz).slice(0, 5) : '-'}
          sub={view.sha ? t.node('goalLoop.goals.checkedSub', { sha: data(view.sha) }) : undefined}
        />
      </Stats>
      <Group caption={t('goalLoop.goals.rows')} testId="goal-rows">
        {view.rows.map((r: GoalRowDto) => (
          <ResultCell key={r.id} testId="goal-row" id={r.id} pass={r.pass} line={r.line} text={r.outcome} t={t} />
        ))}
      </Group>
      {view.standing.length > 0 ? (
        <Group caption={t('goalLoop.goals.standing')} testId="standing-goals">
          {view.standing.map((s) => (
            <ResultCell key={s.id} testId="standing-row" id={s.id} pass={s.pass} line={standingLine(s, tz, t)} text={s.command} issue={s.issue} t={t} />
          ))}
        </Group>
      ) : null}
      {view.loops.length > 0 ? (
        <Group caption={t('goalLoop.goals.loops')} testId="goal-loops">
          {view.loops.map((l) => (
            <LoopCell key={l.id} loop={l} t={t} />
          ))}
        </Group>
      ) : null}
    </>
  );
}

export function GoalsView({ id }: { id: string }) {
  const t = useT();
  const loop = useLoop(id);
  const goals = useGoalView(id);
  if (loop.isPending) return <PageSkeleton />;
  if (loop.isError) return <PageNotFound title={errorTitle(t, loop.error, 'error.LOOP_NOT_FOUND')} />;
  const tz = loop.data.timezone;
  const back = { to: `/loops/${id}`, label: <span data-raw="">{loop.data.name}</span>, testId: 'goals-back' };
  const view = goals.data;
  return (
    <PushedPage back={back} narrow>
      <PageHead title={t('goalLoop.goals.title')} />
      {view?.manifest ? (
        <>
          <p className="page-desc">{data(view.manifest)}</p>
          <Body view={view} tz={tz} t={t} />
        </>
      ) : goals.isError ? (
        <div className="empty is-err" data-testid="goals-load-error" role="alert">
          <b>{errorTitle(t, goals.error, 'error.LOOP_NOT_FOUND')}</b>
        </div>
      ) : view ? (
        <div className="empty" data-testid="goals-empty">
          <b>{t('goalLoop.goals.empty')}</b>
        </div>
      ) : (
        <span className="skeleton is-block" aria-busy="true" />
      )}
    </PushedPage>
  );
}
