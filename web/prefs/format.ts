// Number / duration / time formatting shared by the 5 screens - written exactly the way the approved preview does (design/preview/preview.js);
// the unit words come from the i18n key set (`dur.*`, `rel.in`). Pure functions: they take the `t` of the selected language.
import type { Lang, MessageKey, Params } from './messages';

export type T = (key: MessageKey, params?: Params) => string;

const NBSP = ' ';
const pad = (n: number) => String(n).padStart(2, '0');

/** 1234567 → `1 234 567` (vi) / `1,234,567` (en). */
export function fmtNumber(lang: Lang, n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'vi' ? NBSP : ',');
}

/** Long duration in words: `4 h 12 min`, `2 d 3 h`, `42 s` (non-breaking spaces). */
export function fmtDuration(t: T, sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  let out: string;
  if (d) out = h ? t('dur.dh', { d, h }) : t('dur.d', { d });
  else if (h) out = m ? t('dur.hm', { h, m }) : t('dur.h', { h });
  else if (m) out = t('dur.m', { m });
  else out = t('dur.s', { s });
  return out.replace(/ /g, NBSP);
}

/** Short duration: `2d 3h`, `4h 12m`, under 1 hour like `fmtDuration`. */
export function fmtDurationShort(t: T, sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 86400) return t('dur.short.dh', { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600) });
  if (s >= 3600) return t('dur.short.hm', { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) });
  return fmtDuration(t, s);
}

/** Clock: `00:42`, `1:05:09`. */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** `in 18 min`. */
export function fmtRelative(t: T, sec: number): string {
  return t('rel.in', { d: fmtDuration(t, sec) });
}

/** Time `HH:MM:SS` in a time zone (default: the browser's time zone; the loop screen passes `loop.timezone`). */
export function fmtTime(at: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) }).format(at);
}

/** `dd/mm HH:MM:SS` in a time zone. */
export function fmtDateTime(at: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
