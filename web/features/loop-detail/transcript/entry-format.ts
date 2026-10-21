// Rules for showing a transcript entry (D-UI29, preview.js `txFold` / `txInput` / `txSubject` / `txSize`) - pure functions. Fold, do not
// cut: the content is always complete in the DOM, only the choice of wrapping in `<details>` is decided.
import type { Lang } from '../../../prefs/messages';

/** Threshold for folding tool input / result: more than 30 lines OR more than 3 000 characters (one long JSON line - D-UI29 ①). */
export const TX_FOLD_LINES = 30;
export const TX_FOLD_CHARS = 3000;
/** Symbol at the start of the label of each kind of entry (D-UI27). */
export const TX_GLYPH = { user: '›', assistant: '●', thinking: '∴', tool_use: '▸', tool_result: '◂', system: '·' } as const;
/** Field used as the subject line of a tool call, in priority order (D-UI29). */
const TX_SUBJECT = ['command', 'file_path', 'pattern', 'description', 'url', 'prompt', 'query'];

/** `always` = the Prompt entry: folds when more than one line (D-UI29 ③). */
export function shouldFold(text: string, always = false): boolean {
  const lines = text.split('\n').length;
  return always ? lines > 1 : lines > TX_FOLD_LINES || text.length > TX_FOLD_CHARS;
}

/** First non-empty line - the summary line when folded. */
export function firstLine(text: string): string {
  return text.split('\n').find((x) => x.trim()) ?? '';
}

/** `412 B` · `5,9 KB` (vi) / `5.9 KB` (en) - counts UTF-8 bytes. */
export function txSize(text: string, lang: Lang): string {
  const b = new TextEncoder().encode(text).length;
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1).replace('.', lang === 'vi' ? ',' : '.')} KB`;
}

function parseObject(json: string): Record<string, unknown> | null {
  try {
    const o: unknown = JSON.parse(json);
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Subject line of a tool call: the first string field in priority order, then any string field - first line only. */
export function toolSubject(json: string): string {
  const o = parseObject(json);
  if (!o) return '';
  const k = TX_SUBJECT.find((x) => typeof o[x] === 'string');
  const v = k ? o[k] : Object.values(o).find((x) => typeof x === 'string');
  return typeof v === 'string' ? firstLine(v) : '';
}

/**
 * Tool call input by level-1 field (D-UI29, a fix made at review): a string keeps real line breaks, other values print as pretty JSON.
 * Not an object / an empty object -> null (show the verbatim JSON).
 */
export function toolFields(json: string): [string, string][] | null {
  const o = parseObject(json);
  if (!o || !Object.keys(o).length) return null;
  return Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v, null, 2)]);
}

/** Plain text of the rendered input block (`name:\nvalue` per field) - to measure the fold rule and the summary line. */
export function fieldsText(fields: readonly [string, string][]): string {
  return fields.map(([k, v]) => `${k}:\n${v}`).join('\n');
}
