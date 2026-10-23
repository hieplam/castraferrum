// The sample transcripts of the design preview (design/ds/preview/data.js `PV.transcripts`) written back as JSONL files in
// the Claude Code format, under `<CLAUDE_CONFIG_DIR>/projects/` of the test server → the app shots read exactly the text
// the preview draws, through the real path (claude-jsonl adapter → API → UI). One entry per line; the time `at`
// (`HH:MM:SS` of the preview day, Vietnam time) becomes `timestamp`.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_JS, previewData, pvTime, sid } from './preview-world';

/** Key of `PV.transcripts` → the run of the preview world that carries that session. */
export const PREVIEW_TRANSCRIPTS = {
  pilot69: ['pilot', 69],
  debt104: ['debt', 104],
  pilot63: ['pilot', 63],
  // Only in the new preview's data.js (U7): the run page's ended runs.
  pilot68: ['pilot', 68],
  pilot59: ['pilot', 59],
  oldsched4: ['oldsched', 4],
  evidence4: ['evidence', 4],
} as const;
export type PreviewTranscriptKey = keyof typeof PREVIEW_TRANSCRIPTS;

type PvEntry = { at: string; kind: string; text: string; tool?: string; err?: boolean };

function line(e: PvEntry, i: number): Record<string, unknown> {
  const timestamp = pvTime(e.at).toISOString();
  const base = { parentUuid: null, isSidechain: false, uuid: `pv-${i}`, timestamp };
  const id = `toolu_pv${i}`;
  switch (e.kind) {
    case 'user':
      return { ...base, type: 'user', message: { role: 'user', content: e.text } };
    case 'tool_result':
      return { ...base, type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: e.text, is_error: e.err === true }] } };
    case 'thinking':
      return { ...base, type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: e.text, signature: 'pv' }] } };
    case 'tool_use':
      return { ...base, type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: e.tool, input: JSON.parse(e.text) }] } };
    case 'assistant':
      return { ...base, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: e.text }] } };
    case 'system':
      return { ...base, type: 'system', subtype: e.text };
    default:
      throw new Error(`unknown entry kind in PV.transcripts: ${e.kind}`);
  }
}

/** Path of the file of a sample transcript under `projectsDir`. */
export function previewTranscriptFile(projectsDir: string, key: PreviewTranscriptKey): string {
  const [loop, n] = PREVIEW_TRANSCRIPTS[key];
  return join(projectsDir, 'C--preview-work-acme-api', `${sid(loop, n)}.jsonl`);
}

export function writePreviewTranscript(projectsDir: string, key: PreviewTranscriptKey, data = DATA_JS): void {
  const entries = (previewData(data) as unknown as { transcripts: Record<string, PvEntry[]> }).transcripts[key];
  if (!entries) throw new Error(`no PV.transcripts.${key}`);
  const file = previewTranscriptFile(projectsDir, key);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, entries.map((e, i) => `${JSON.stringify(line(e, i))}\n`).join(''));
}

export function removePreviewTranscript(projectsDir: string, key: PreviewTranscriptKey): void {
  rmSync(previewTranscriptFile(projectsDir, key), { force: true });
}

/** Number of entries of a sample transcript (the preview draws all of them / a page of 50). */
export function previewTranscriptLength(key: PreviewTranscriptKey, file = DATA_JS): number {
  return (previewData(file) as unknown as { transcripts: Record<string, PvEntry[]> }).transcripts[key]!.length;
}
