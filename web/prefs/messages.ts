// The web's t() function (D11: a hand-written i18n, no library). The key set lives in shared/i18n/vi.ts + en.ts (the same key set -
// the TS type + the test shared/i18n/i18n.test.ts catch a missing key). The schedule sentence is NOT here: it comes from shared/domain/schedule.ts.
import { en, type MessageKey } from '../../shared/i18n/en';
import { vi } from '../../shared/i18n/vi';

export type Lang = 'en' | 'vi';
export type { MessageKey };
export type Params = Record<string, string | number>;

export const LANGS: readonly Lang[] = ['en', 'vi'];
export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { en, vi };

/** `{x}` -> the value of parameter `x`; a parameter not passed keeps `{x}` as is (visible right away on screen). */
export function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  return format(MESSAGES[lang][key], params);
}

/**
 * Like `format` but the parameters may be elements (a bold number, a status tag): returns an array of pieces in order so the
 * component can assemble them (`useT().node`). Text pieces stay as is; a missing parameter keeps `{x}`.
 */
export function formatParts<N>(template: string, params: Record<string, N | string | number>): (N | string)[] {
  const out: (N | string)[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const k = m[1] as string;
    if (!(k in params)) continue;
    if (m.index > last) out.push(template.slice(last, m.index));
    const v = params[k] as N | string | number;
    out.push(typeof v === 'number' ? String(v) : v);
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}

/** The plural bases of the locale files: a key `<base>.one` (and `<base>.other`, and optionally `<base>.zero`). */
export type PluralBase = MessageKey extends infer K ? (K extends `${infer B}.one` ? B : never) : never;

/**
 * A plural text (spec D16): `<base>.zero` when `n` is 0 and the key exists, `<base>.one` for 1, `<base>.other` for the rest.
 * `{n}` is filled in; `params` adds the other parameters.
 */
export function tn(lang: Lang, base: PluralBase, n: number, params?: Params): string {
  const zero = `${base}.zero` as MessageKey;
  const key = (n === 0 && zero in MESSAGES[lang] ? zero : n === 1 ? `${base}.one` : `${base}.other`) as MessageKey;
  return format(MESSAGES[lang][key], { n, ...params });
}
