import type { TranscriptEntry } from '../../../../shared/domain/transcript';

// The ONLY place that knows the format of a Claude Code JSONL line (SPEC-phase-2 § Line-filtering rules). The format is internal to
// Claude Code and changes between versions (measured on 2.1.303), so anything unfamiliar is skipped and an error is never thrown.

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * One complete JSONL line (without the trailing `\n`) starting at byte `offset` → 0..n entries. Keeps `user` / `assistant` / `system`;
 * drops `isSidechain` lines, broken JSON, and every other type (`attachment`, `api-request-blob`, `cost-state`… — internal).
 * Content is kept verbatim, never truncated (D27).
 */
export function parseClaudeLine(line: string, offset: number): TranscriptEntry[] {
  let row: unknown;
  try {
    row = JSON.parse(line);
  } catch {
    return [];
  }
  if (!isObject(row) || row.isSidechain === true) return [];
  const at = str(row.timestamp) ?? null;
  const entry = (block: number, kind: TranscriptEntry['kind'], text: string, extra: Partial<TranscriptEntry> = {}): TranscriptEntry => ({
    offset,
    block,
    at,
    kind,
    text,
    ...extra,
  });
  const content = isObject(row.message) ? row.message.content : undefined;

  switch (row.type) {
    case 'user': {
      if (typeof content === 'string') return [entry(0, 'user', content)];
      if (!Array.isArray(content)) return [];
      const out: TranscriptEntry[] = [];
      content.forEach((b: unknown, i) => {
        if (!isObject(b)) return;
        if (b.type === 'text') out.push(entry(i, 'user', str(b.text) ?? ''));
        else if (b.type === 'tool_result') {
          const extra: Partial<TranscriptEntry> = {};
          const id = str(b.tool_use_id);
          if (id !== undefined) extra.toolUseId = id;
          if (b.is_error === true) extra.isError = true;
          out.push(entry(i, 'tool_result', toolResultText(b.content), extra));
        }
      });
      return out;
    }
    case 'assistant': {
      if (!Array.isArray(content)) return [];
      const out: TranscriptEntry[] = [];
      content.forEach((b: unknown, i) => {
        if (!isObject(b)) return;
        if (b.type === 'thinking') out.push(entry(i, 'thinking', str(b.thinking) ?? ''));
        else if (b.type === 'text') out.push(entry(i, 'assistant', str(b.text) ?? ''));
        else if (b.type === 'tool_use') {
          const extra: Partial<TranscriptEntry> = { toolName: str(b.name) ?? '' };
          const id = str(b.id);
          if (id !== undefined) extra.toolUseId = id;
          out.push(entry(i, 'tool_use', JSON.stringify(b.input ?? {}, null, 2), extra));
        }
      });
      return out;
    }
    case 'system': {
      const subtype = str(row.subtype) ?? 'system';
      const text = str(row.content);
      return [entry(0, 'system', text ? `${subtype}: ${text}` : subtype)];
    }
    default:
      return [];
  }
}

/** `tool_result.content`: a string is kept as is; an array of blocks → the `text` blocks joined by newlines (an image → "[image]"). */
function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const b of content) {
    if (!isObject(b)) continue;
    if (b.type === 'text') parts.push(str(b.text) ?? '');
    else if (b.type === 'image') parts.push('[image]');
  }
  return parts.join('\n');
}
