// Counts transcript entries INDEPENDENTLY of the server (e2e UC-27): reads the `<session_id>.jsonl` file Claude Code writes and applies the
// filter rules of SPEC-phase-2 § Transcript (the table "JSONL line filter rules -> entries") - rewritten, no import of the `claude-jsonl` adapter, so the entry count
// on screen is compared with a count that does not pass through the code under test.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type FileEntry = { kind: 'user' | 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'system'; text: string; toolUseId?: string; at: string | null };

/** `${CLAUDE_CONFIG_DIR ?? ~/.claude}/projects/<any folder>/<session_id>.jsonl` (the folder name cannot be derived from the cwd). */
export function findSessionFile(sessionId: string): string | null {
  const root = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'projects');
  if (!existsSync(root)) return null;
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const f = join(root, dir.name, `${sessionId}.jsonl`);
    if (existsSync(f)) return f;
  }
  return null;
}

type Block = { type?: string; text?: string; thinking?: string; name?: string; id?: string; input?: unknown; content?: unknown; tool_use_id?: string; is_error?: boolean };

function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as Block[]).map((b) => (b.type === 'text' ? (b.text ?? '') : b.type === 'image' ? '[image]' : '')).join('');
}

/** Every entry of the file by the spec filter rules: only complete lines (with `\n`), broken JSON dropped, `isSidechain` dropped, internal kinds dropped. */
export function readFileEntries(file: string): FileEntry[] {
  const raw = readFileSync(file, 'utf8');
  const complete = raw.slice(0, raw.lastIndexOf('\n') + 1);
  const out: FileEntry[] = [];
  for (const line of complete.split('\n')) {
    if (!line.trim()) continue;
    let o: { type?: string; isSidechain?: boolean; timestamp?: string; subtype?: string; content?: unknown; message?: { content?: unknown } };
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.isSidechain === true) continue;
    const at = typeof o.timestamp === 'string' ? o.timestamp : null;
    const content = o.message?.content;
    if (o.type === 'user') {
      if (typeof content === 'string') out.push({ kind: 'user', text: content, at });
      else if (Array.isArray(content))
        for (const b of content as Block[]) {
          if (b.type === 'text') out.push({ kind: 'user', text: b.text ?? '', at });
          else if (b.type === 'tool_result') out.push({ kind: 'tool_result', text: resultText(b.content), ...(b.tool_use_id ? { toolUseId: b.tool_use_id } : {}), at });
        }
    } else if (o.type === 'assistant' && Array.isArray(content)) {
      for (const b of content as Block[]) {
        if (b.type === 'thinking') out.push({ kind: 'thinking', text: b.thinking ?? '', at });
        else if (b.type === 'text') out.push({ kind: 'assistant', text: b.text ?? '', at });
        else if (b.type === 'tool_use') out.push({ kind: 'tool_use', text: JSON.stringify(b.input ?? {}, null, 2), ...(b.id ? { toolUseId: b.id } : {}), at });
      }
    } else if (o.type === 'system') {
      out.push({ kind: 'system', text: [o.subtype, typeof o.content === 'string' ? o.content : null].filter(Boolean).join(' · '), at });
    }
  }
  return out;
}
