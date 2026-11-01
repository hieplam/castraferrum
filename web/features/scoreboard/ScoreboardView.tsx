// The process scoreboard (goal G15, spec 5, preview state `scoreboard`): four figures, the repeats of each of the last 5 weeks and
// each cause around the date its check merged. Figures and rows only, no chart. It is a page pushed from Settings: the phone keeps
// the tab bar under the navigation bar. Every number comes from the API.
import type { ScoreboardCauseDto, ScoreboardDto } from '../../../shared/contracts/scoreboard';
import { browserTimeZone } from '../../data/overview';
import { fmtDayMonth, useScoreboard } from '../../data/scoreboard';
import { useT } from '../../prefs/prefs';
import { Cell, Group, RowCell } from '../../ui/kit/Group';
import { PageHead } from '../../ui/kit/Layout';
import { Stat, Stats } from '../loop-detail/Figures';
import { PushedPage } from '../loop-detail/PushedPage';

type TFn = ReturnType<typeof useT>;
const data = (text: string) => <span className="data">{text}</span>;

function CauseRow({ cause, tz, t }: { cause: ScoreboardCauseDto; tz: string; t: TFn }) {
  const merged = cause.checkMergedAt;
  return (
    <RowCell testId="score-cause">
      <span className="cell-main">
        <span className="cell-title">{cause.cause}</span>
        <span className="cell-meta">
          <span>{merged ? t.node('goalLoop.score.checkMerged', { t: data(fmtDayMonth(merged, tz)) }) : t('goalLoop.score.noCheck')}</span>{' '}
          <span className="keep">
            ·{' '}
            {merged
              ? t.node('goalLoop.score.beforeAfter', { a: data(String(cause.before)), b: data(String(cause.after)) })
              : t.tn('goalLoop.score.repeats', cause.repeats)}
          </span>
        </span>
        {cause.checkName ? <span className="cell-meta is-data">{cause.checkName}</span> : null}
      </span>
    </RowCell>
  );
}

function Body({ board, tz, t }: { board: ScoreboardDto; tz: string; t: TFn }) {
  const f = board.figures;
  return (
    <>
      <Stats testId="score-figures">
        <Stat label={t('goalLoop.score.causes')} value={f.causes} sub={t('goalLoop.score.causesSub')} />
        <Stat label={t('goalLoop.score.checks')} value={f.checks} sub={t('goalLoop.score.checksSub')} />
        <Stat label={t('goalLoop.score.before')} value={f.before} sub={t('goalLoop.score.beforeSub')} />
        <Stat label={t('goalLoop.score.after')} value={f.after} sub={t('goalLoop.score.afterSub')} />
      </Stats>
      <Group caption={t('goalLoop.score.weeks')} testId="score-weeks">
        {board.weeks.map((w) => (
          <Cell key={w.from.toISOString()} testId="score-week" plain title={t.node('goalLoop.score.week', { t: data(fmtDayMonth(w.from, tz)) })} value={w.repeats} valueData />
        ))}
      </Group>
      <Group caption={t('goalLoop.score.causeList')} testId="score-causes">
        {board.causes.map((c) => (
          <CauseRow key={c.fingerprint} cause={c} tz={tz} t={t} />
        ))}
      </Group>
    </>
  );
}

export function ScoreboardView() {
  const t = useT();
  const tz = browserTimeZone();
  const board = useScoreboard();
  return (
    <PushedPage back={{ to: '/settings', label: t('nav.settings'), testId: 'score-back' }} narrow>
      <PageHead title={t('goalLoop.score.title')} />
      <p className="page-desc">{t('goalLoop.score.desc')}</p>
      {board.isError ? (
        <div className="empty is-err" data-testid="score-load-error" role="alert">
          <b>{t('error.NETWORK')}</b>
        </div>
      ) : board.data ? (
        <Body board={board.data} tz={tz} t={t} />
      ) : (
        <span className="skeleton is-block" aria-busy="true" />
      )}
    </PushedPage>
  );
}
