import { describe, expect, it } from 'vitest';
import { parseClaudeLine } from './claude-line';

// Line-filtering rules (SPEC-phase-2 § JSONL line-filtering rules → entry). The sample lines keep the exact shape measured on Claude Code 2.1.303.

const TS = '2026-10-19T15:20:01.000Z';
const line = (o: unknown) => JSON.stringify(o);

describe('parseClaudeLine — filtering Claude Code JSONL lines', () => {
  it('drops every measured internal line type (22 types across 117 files on this machine) and unknown types — no error', () => {
    const internal = [
      'attachment', 'api-request-shape', 'api-request-blob', 'api-request', 'queue-operation', 'atis-latch', 'last-prompt',
      'ai-title', 'mode', 'permission-mode', 'pr-link', 'frame-link', 'file-history-snapshot', 'file-history-delta',
      'custom-title', 'agent-name', 'artifact-comment-monitor', 'artifact-autoreact-ledger', 'cost-state', 'relocated',
      'worktree-state', 'dev-mods',
    ];
    expect(internal).toHaveLength(22);
    // an internal line that also has a conversation-like message.content (api-request-blob) must still be dropped
    for (const type of [...internal, 'new-unknown-type']) {
      expect(parseClaudeLine(line({ type, timestamp: TS, message: { role: 'user', content: [{ type: 'text', text: 'x' }] } }), 0)).toEqual([]);
    }
  });

  it('drops isSidechain lines, broken JSON, values that are not objects', () => {
    expect(parseClaudeLine(line({ type: 'user', isSidechain: true, message: { content: 'subagent' } }), 0)).toEqual([]);
    expect(parseClaudeLine('{"type":"user","message":{"content":"broken', 0)).toEqual([]);
    expect(parseClaudeLine('[1,2]', 0)).toEqual([]);
    expect(parseClaudeLine('null', 0)).toEqual([]);
  });

  it('user: string content → 1 user entry; array content → text = user, tool_result = tool_result (joined text, image → [image], is_error)', () => {
    expect(parseClaudeLine(line({ type: 'user', timestamp: TS, message: { content: 'Run it' } }), 42)).toEqual([
      { offset: 42, block: 0, at: TS, kind: 'user', text: 'Run it' },
    ]);
    const entries = parseClaudeLine(
      line({
        type: 'user',
        timestamp: TS,
        message: {
          content: [
            { type: 'text', text: 'question' },
            { type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'line 1' }, { type: 'image', source: {} }, { type: 'text', text: 'line 2' }] },
            { type: 'tool_result', tool_use_id: 'toolu_2', is_error: true, content: 'Exit code 1' },
          ],
        },
      }),
      7,
    );
    expect(entries).toEqual([
      { offset: 7, block: 0, at: TS, kind: 'user', text: 'question' },
      { offset: 7, block: 1, at: TS, kind: 'tool_result', text: 'line 1\n[image]\nline 2', toolUseId: 'toolu_1' },
      { offset: 7, block: 2, at: TS, kind: 'tool_result', text: 'Exit code 1', toolUseId: 'toolu_2', isError: true },
    ]);
  });

  it('assistant: thinking + tool_use in one line → 2 entries at the same offset, block 0 / 1; tool_use = the full JSON input; text → assistant', () => {
    const input = { command: 'ls -la', description: 'List' };
    const entries = parseClaudeLine(
      line({
        type: 'assistant',
        timestamp: TS,
        message: { model: 'claude-haiku-5-5', content: [{ type: 'thinking', thinking: 'thinking…', signature: 'sig' }, { type: 'tool_use', id: 'toolu_9', name: 'Bash', input }] },
      }),
      100,
    );
    expect(entries).toEqual([
      { offset: 100, block: 0, at: TS, kind: 'thinking', text: 'thinking…' },
      { offset: 100, block: 1, at: TS, kind: 'tool_use', text: JSON.stringify(input, null, 2), toolName: 'Bash', toolUseId: 'toolu_9' },
    ]);
    expect(parseClaudeLine(line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Xong.' }] } }), 5)).toEqual([
      { offset: 5, block: 0, at: null, kind: 'assistant', text: 'Xong.' },
    ]);
  });

  it('system → 1 entry recording the subtype (+ content if present)', () => {
    expect(parseClaudeLine(line({ type: 'system', subtype: 'stop_hook_summary', timestamp: TS }), 0)).toEqual([
      { offset: 0, block: 0, at: TS, kind: 'system', text: 'stop_hook_summary' },
    ]);
    expect(parseClaudeLine(line({ type: 'system', subtype: 'informational', content: 'Compacted' }), 0)[0]?.text).toBe('informational: Compacted');
  });
});
