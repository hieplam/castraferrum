// Formatting specific to the 3 detail screens (loop · execution · run) - written exactly the way the approved preview does (design/preview/preview.js:
// clock, upFmt, mmss, runDur, sidShort, mockSummary...). Time is always in the loop's time zone. Pure functions.
import type { LogLineDto, RunDto } from '../../../shared/contracts/loops';
import { fmtClock, fmtDateTime, fmtDuration, fmtDurationShort, fmtTime, type T } from '../../prefs/format';
import { formatUsd, REPO_MISSING_PREFIXES } from '../../../shared/domain/cost';
import { describe } from '../../../shared/domain/schedule';

const pad = (n: number) => String(n).padStart(2, '0');

function dayKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(at);
}

/** Same day as `now` (in the loop's time zone) -> `HH:MM:SS`, another day -> `dd/mm HH:MM:SS` (run table, run timestamps). */
export function fmtStamp(at: Date, timeZone: string, now: Date): string {
  return dayKey(at, timeZone) === dayKey(now, timeZone) ? fmtTime(at, timeZone) : fmtDateTime(at, timeZone);
}

/** Like `fmtStamp` but only to the minute (`14:30` / `16/10 08:30`) - the next run. */
export function fmtStampHm(at: Date, timeZone: string, now: Date): string {
  return fmtStamp(at, timeZone, now).slice(0, -3);
}

/** `1:33` - minutes:seconds (average per run). */
export function fmtMmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** Duration of a run: under 1 hour `m:ss`, from 1 hour `h:mm:ss`. */
export function fmtRunDuration(sec: number): string {
  return sec >= 3600 ? fmtClock(sec) : fmtMmss(sec);
}

/** "Running for" of an execution: under 1 day a clock `4:13:27`, from 1 day `1d 3h`. */
export function fmtUptime(t: T, sec: number): string {
  return sec >= 86400 ? fmtDurationShort(t, sec) : fmtClock(sec);
}

/** `8f3a1c2e…142f` - the first 8 characters of the Claude session id (uuid) like the approved preview. */
export function sidShort(sessionId: string): string {
  return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

/** Character cap of the ↳ summary line (D-UI23). */
export const SUMMARY_LINE_MAX = 80;

/**
 * The ↳ line under a run row (D-UI22...D-UI25 - preview.js `sumLine`): the first non-empty line of the summary, surrounding whitespace
 * dropped, cut at 80 characters (counted by code point like Postgres `left()`); longer than the cap or more lines after it -> append `…`.
 * No text -> `null` (the web shows `—`).
 */
export function summaryLine(summary: string | null): string | null {
  const lines = (summary ?? '').split(/\r?\n/);
  const i = lines.findIndex((x) => x.trim());
  if (i < 0) return null;
  const cps = Array.from((lines[i] as string).trim());
  const more = cps.length > SUMMARY_LINE_MAX || lines.slice(i + 1).some((x) => x.trim());
  return cps.slice(0, SUMMARY_LINE_MAX).join('') + (more ? '…' : '');
}

/** Cost of a run (D-UI16): `$1.92`; none -> `—`. */
export function fmtCost(cost: number | null): string {
  return cost === null ? '—' : formatUsd(cost);
}

/** A run that failed because the repo folder is gone (UC-23) - an error the console writes itself, not the agent's (D-UI19). */
export function isRepoMissing(run: { status: string; error: string | null }): boolean {
  return run.status === 'failed' && REPO_MISSING_PREFIXES.some((p) => (run.error ?? '').startsWith(p));
}

/** Timeout of a loop / run: `null` = no limit (SPEC-phase-2). */
export function fmtTimeout(t: T, sec: number | null): string {
  return sec === null ? t('dur.unlimited') : fmtDuration(t, sec);
}

type ExecConfig = { durationSec?: number; failRate?: number; model?: string; effort?: string };

/** `Claude opus · effort medium` (phase 2) · `Mock 100 seconds, 5 % errors` (test mode only); another executor -> its `kind` name. */
export function executorSummary(t: T, kind: string, config: unknown): string {
  const c = (config ?? {}) as ExecConfig;
  if (kind === 'claude') return t('loop.meta.claude', { model: c.model ?? 'opus', effort: c.effort ?? 'medium' });
  if (kind !== 'mock') return kind;
  return t('loop.meta.mock', { d: t('dur.s', { s: c.durationSec ?? 10 }), p: c.failRate ?? 0 });
}

/** `#6 #5 #4` - the running iterations, in the order they were added. */
export const roundList = (runs: readonly { iteration: number | null }[]): string => runs.map((r) => `#${r.iteration ?? ''}`).join(' ');

/** Seconds from `from` to `to`. */
export const secBetween = (from: Date, to: Date): number => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));

/**
 * Displayed duration of a run: running -> up to now; finished -> the server's `durationMs` (an `interrupted` run counts
 * up to the last heartbeat - recovery); skipped -> none.
 */
export function runSeconds(run: RunDto, now: Date): number | null {
  if (run.status === 'skipped') return null;
  if (run.status === 'running') return secBetween(run.startedAt, now);
  return run.durationMs === null ? null : Math.floor(run.durationMs / 1000);
}

/** When the run really stopped running: `interrupted` = start + duration (last heartbeat); otherwise `finishedAt`. */
export function runEndedAt(run: RunDto): Date | null {
  if (run.status === 'interrupted' && run.durationMs !== null) return new Date(run.startedAt.getTime() + run.durationMs);
  return run.finishedAt;
}

/** Timeout of a run when it ran (seconds) - from the run's own `deadlineAt` (a snapshot, not the current loop). */
export function runTimeoutSec(run: RunDto): number | null {
  return run.deadlineAt ? Math.round((run.deadlineAt.getTime() - run.startedAt.getTime()) / 1000) : null;
}

/**
 * Log lines -> LogView lines: the first line of a run is the opening line (`head`), level `error` -> red, the last line of a successful run
 * -> green. Does not read the log text (the phase 2 executor prints other text).
 */
/** One line as a log view draws it; both UIs' log components take this shape. */
export type LogViewLine = { key: number; seq: number; time: string; tone?: 'head' | 'ok' | 'err'; text: string };

export function toLogViewLines(lines: readonly LogLineDto[], timeZone: string, status: RunDto['status'] | null): LogViewLine[] {
  const last = lines[lines.length - 1];
  return lines.map((l) => ({
    key: l.seq,
    seq: l.seq,
    time: fmtTime(l.at, timeZone),
    tone: l.level === 'error' ? 'err' : l.seq === 1 ? 'head' : status === 'succeeded' && l === last ? 'ok' : undefined,
    text: l.message,
  }));
}

/**
 * The time printed before the cursor of the live log = now (the approved preview: `start + running time`). A Claude run writes only a few lines of the
 * console (D-UI18), so "one second after the last line" of phase 1 stays frozen at the start time - now is always right, Mock included.
 */
export function cursorTime(now: Date, timeZone: string): string {
  return fmtTime(now, timeZone);
}

// ── The new UI's loop page, All runs and active period page (spec 5.3, 5.4), written the way the approved new preview does
// (design/ds/preview/preview.js: when, stamp, dur, clock). Times are in the loop's time zone.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 0 = Sunday ... 6 = Saturday, in a time zone. */
export function weekdayOf(at: Date, timeZone: string): number {
  return WEEKDAYS.indexOf(new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(at));
}

/**
 * `Sun 09:47` today, `Sat 17/10 08:00` another day, `09:31` alone when `sameAs` is on the same day (the end of a span that started
 * that day).
 */
export function fmtWhen(t: T, at: Date, timeZone: string, now: Date, sameAs?: Date): string {
  const day = dayKey(at, timeZone);
  const time = fmtTime(at, timeZone).slice(0, 5);
  if (sameAs && dayKey(sameAs, timeZone) === day) return time;
  const date = day === dayKey(now, timeZone) ? '' : ` ${fmtDateTime(at, timeZone).slice(0, 5)}`;
  return `${t(`day.short.${weekdayOf(at, timeZone)}` as Parameters<T>[0])}${date} ${time}`;
}

/** When a run started: `14:00` today, otherwise as `fmtWhen`. */
export function fmtRunStart(t: T, at: Date, timeZone: string, now: Date): string {
  return dayKey(at, timeZone) === dayKey(now, timeZone) ? fmtTime(at, timeZone).slice(0, 5) : fmtWhen(t, at, timeZone, now);
}

/** A span of time: `1d 3h`, `4h 13m`, `29 min`, `42 s`. */
export function fmtSpan(t: T, sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return t('dur.short.dh', { d, h });
  if (h) return t('dur.short.hm', { h, m });
  return m ? t('dur.m', { m }) : t('dur.s', { s });
}

/** Whole minutes of a wait: `29 min` (the next run, even past an hour, as the preview counts it). */
export function fmtWaitMinutes(t: T, sec: number): string {
  return t('dur.m', { m: Math.floor(Math.max(0, sec) / 60) });
}

/** The sentence of a schedule (`Every 30 minutes`); a cron the domain cannot describe is shown as it is. */
export function scheduleSentence(cron: string, lang: 'en' | 'vi'): string {
  try {
    return describe(cron, lang);
  } catch {
    return cron;
  }
}
