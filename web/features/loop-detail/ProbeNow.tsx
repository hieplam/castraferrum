// What a loop with a probe adds to the loop page (goal G28, preview states `probe-waiting`, `probe-held`, `probe-blocked`,
// `probe-complete`): the words of the now card for each state of the probe, the hold banner, and under the card the list that the
// state owns (open holds, blocking issues, the active period that ended) followed by the last probe line. The page only reads: the
// state, the line and the holds come from the API, and the line is read with `parseProbeLine` of shared/domain/goal-loop.ts.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { ProbeDto } from '../../../shared/contracts/goal-loop';
import type { HoldDto } from '../../../shared/contracts/holds';
import type { ExecutionDto } from '../../../shared/contracts/loops';
import { RESERVED_RESOURCE, type ProbeState } from '../../../shared/domain/goal-loop';
import { mainHold, readProbe, shownProbeLine, type ProbeReading } from '../../data/probe';
import { fmtTime } from '../../prefs/format';
import { useT } from '../../prefs/prefs';
import { Banner } from '../../ui/kit/Banner';
import { Button } from '../../ui/kit/Button';
import { copyText } from '../../ui/kit/copy';
import { Icon } from '../../ui/kit/Icon';
import { Pill } from '../../ui/kit/Pill';
import { useToast } from '../../ui/toast';
import { fmtWhen } from './format';
import { periodCountsText, periodSpanText } from './period-text';

/** The states of a probe that change what the loop page says (`active` keeps the page of any other loop). */
export type ProbeKind = Exclude<ProbeState, 'active'>;

export const probeKindOf = (probe: Pick<ProbeDto, 'state'> | null | undefined): ProbeKind | null => (probe && probe.state !== 'active' ? probe.state : null);

/** The probe and what the page needs besides it: the reading of the stored line and the open holds (`undefined` while they load). */
export type ProbeContext = { probe: ProbeDto; reading: ProbeReading; holds: HoldDto[] | undefined };

export function probeContext(probe: ProbeDto, holds: HoldDto[] | undefined): ProbeContext {
  return { probe, reading: readProbe(probe), holds };
}

type T = ReturnType<typeof useT>;
const hm = (at: Date, tz: string) => fmtTime(at, tz).slice(0, 5);
const data = (text: string) => <span className="data">{text}</span>;

export type ProbeNowText = {
  head: ReactNode;
  sub: ReactNode;
  mark: 'warn' | 'fail' | 'ok' | null;
  /** The run that the now card opens: the run that the hold keeps. `null` = the card opens the last run, as every loop card does. */
  open: { to: string; label: string } | null;
};

/** The head, the sentence and the dot of the now card for one state of the probe. */
export function probeNowText(t: T, kind: ProbeKind, ctx: ProbeContext, exec: ExecutionDto | null, tz: string, now: Date): ProbeNowText {
  const { line } = ctx.reading;
  const reason = line?.reason ?? '';
  switch (kind) {
    case 'waiting':
      return { head: t('goalLoop.now.waiting'), sub: t('goalLoop.now.waitingSub', { reason }), mark: 'warn', open: null };
    case 'blocked':
      return { head: t('goalLoop.now.blocked'), sub: t('goalLoop.now.blockedSub', { reason }), mark: 'fail', open: null };
    case 'complete':
      return {
        head: t('goalLoop.now.complete'),
        sub: t('goalLoop.now.completeSub', { k: exec?.seq ?? '', t: exec?.endedAt ? fmtWhen(t, exec.endedAt, tz, now) : '-' }),
        mark: 'ok',
        open: null,
      };
    case 'probe_failed':
      return { head: t('goalLoop.now.probeFailed'), sub: t('goalLoop.now.probeFailedSub', { reason: ctx.reading.raw ?? '-' }), mark: 'fail', open: null };
    case 'budget_limited':
      return { head: t('goalLoop.now.budgetLimited'), sub: t('goalLoop.now.budgetLimitedSub'), mark: 'warn', open: null };
    case 'held': {
      const hold = mainHold(ctx.holds);
      const resource = hold?.resource ?? line?.resource ?? RESERVED_RESOURCE;
      const run = hold?.openedByRun ?? null;
      const until = hold?.until ?? null;
      const sub = until
        ? run
          ? t('goalLoop.now.heldSub', { t: hm(until, tz), n: run.iteration ?? '' })
          : t('goalLoop.now.heldSubNoRun', { t: hm(until, tz) })
        : t('goalLoop.now.heldSubNoEnd');
      return {
        head: t.node('goalLoop.now.held', { resource: data(resource) }),
        sub,
        mark: null,
        open: run ? { to: `/runs/${run.id}`, label: t('now.openRun', { n: run.iteration ?? '' }) } : null,
      };
    }
  }
}

/** The banner at the top of the loop page while the usage limit holds every probe loop. `null` while no `plan-window` hold is open. */
export function HoldBanner({ holds, tz }: { holds: HoldDto[] | undefined; tz: string }) {
  const t = useT();
  const hold = holds?.find((h) => h.resource === RESERVED_RESOURCE);
  if (!hold) return null;
  return (
    <Banner tone="warn" testId="banner-hold">
      {hold.until ? t('goalLoop.banner.hold', { t: hm(hold.until, tz) }) : t('goalLoop.banner.holdNoEnd')}
    </Banner>
  );
}

function HoldList({ holds, tz }: { holds: HoldDto[]; tz: string }) {
  const t = useT();
  return (
    <>
      <p className="group-cap">{t('goalLoop.hold.title')}</p>
      <div className="group" data-testid="hold-list">
        {holds.map((h) => (
          <div className="cell" key={h.id} data-testid="hold-row">
            <span className="cell-main">
              <span className="cell-title is-plain">{data(h.resource)}</span>
              <span className="cell-meta">
                {h.openedByRun
                  ? t('goalLoop.hold.opened', { t: hm(h.openedAt, tz), n: h.openedByRun.iteration ?? '' })
                  : t('goalLoop.hold.openedNoRun', { t: hm(h.openedAt, tz) })}
              </span>
            </span>
            <span className="cell-value">{h.until ? t.node('goalLoop.hold.until', { t: data(hm(h.until, tz)) }) : t('goalLoop.hold.untilUnknown')}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** The blocking issues of a `blocked` line: a cell with a link for each entry of `blockers`, or a plain cell for each entry of `issues`. */
function BlockerList({ reading }: { reading: ProbeReading }) {
  const t = useT();
  const line = reading.line;
  if (!line) return null;
  const rows =
    line.blockers.length > 0
      ? line.blockers.map((b) => (
          <a className="cell" key={b.key} href={b.url} target="_blank" rel="noopener" data-testid="blocker-row">
            <span className="cell-main">
              <span className="cell-title" data-raw="">
                {t('goalLoop.blocked.issue', { n: b.key, title: b.title })}
              </span>
              <span className="cell-meta">{t.tn('goalLoop.blocked.tasks', b.blocks)}</span>
            </span>
            <Icon name="chev" className="chev" />
          </a>
        ))
      : line.issues.map((key) => (
          <div className="cell" key={key} data-testid="blocker-row">
            <span className="cell-main">
              <span className="cell-title">{t('goalLoop.blocked.issueOnly', { n: key })}</span>
            </span>
          </div>
        ));
  if (rows.length === 0) return null;
  return (
    <>
      <p className="group-cap">{t('goalLoop.blocked.title')}</p>
      <div className="group" data-testid="blocker-list">
        {rows}
      </div>
    </>
  );
}

/** The active period that the goal closed: its number, the word Goal met, its span and its runs. It opens the period page. */
function ClosedPeriod({ exec, tz, now }: { exec: ExecutionDto; tz: string; now: Date }) {
  const t = useT();
  return (
    <>
      <p className="group-cap">{t('goalLoop.period.closed')}</p>
      <div className="group">
        <Link className="cell" to={`/executions/${exec.id}`} data-execution-id={exec.id}>
          <span className="cell-main">
            <span className="cell-title">{t('period.title', { k: exec.seq })}</span>
            <span className="cell-row">
              <Pill tone="ok" testId="period-status">
                {t('goalLoop.period.goalMet')}
              </Pill>
              <span className="cell-meta">{`${periodSpanText(t, exec, tz, now)} · ${periodCountsText(t.tn, exec.stats.runs, exec.stats.failed)}`}</span>
            </span>
          </span>
          <Icon name="chev" className="chev" />
        </Link>
      </div>
    </>
  );
}

function LastLine({ probe, raw, tz }: { probe: ProbeDto; raw: string; tz: string }) {
  const t = useT();
  const toast = useToast();
  const shown = shownProbeLine(raw);
  // Copy line copies the stored line, with its blockers.
  const copy = () => void copyText(raw).then((ok) => ok && toast.show(t('goalLoop.probe.copied')));
  return (
    <>
      <p className="group-cap">
        {t('goalLoop.probe.last')}{' '}
        <span className="keep">
          · <span className="data">{probe.lastProbeAt ? fmtTime(probe.lastProbeAt, tz) : '-'}</span>
        </span>
      </p>
      <div className="cmd is-wrap" data-testid="probe-line">
        <code data-raw="">{shown}</code>
        <Button variant="plain" onClick={copy} data-testid="probe-line-copy">
          {t('goalLoop.probe.copy')}
        </Button>
      </div>
    </>
  );
}

/** What sits under the now card of a loop that has a probe: the list of its state, then the last probe line. */
export function ProbeExtra({ kind, ctx, exec, tz, now }: { kind: ProbeKind | null; ctx: ProbeContext; exec: ExecutionDto | null; tz: string; now: Date }) {
  return (
    <>
      {kind === 'held' && ctx.holds && ctx.holds.length > 0 ? <HoldList holds={ctx.holds} tz={tz} /> : null}
      {kind === 'blocked' ? <BlockerList reading={ctx.reading} /> : null}
      {kind === 'complete' && exec ? <ClosedPeriod exec={exec} tz={tz} now={now} /> : null}
      {ctx.reading.raw !== null ? <LastLine probe={ctx.probe} raw={ctx.reading.raw} tz={tz} /> : null}
    </>
  );
}
