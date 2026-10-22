// ClaudeAgentExecutor on REAL Claude Code when the agent runs background tasks - yardstick R2 of PLAN.md § A turn ends when
// Claude Code exits on its own and § Over the ceiling: cleanup message. Only runs when LC_REAL_CLAUDE=1 (normally skipped, like `claude (real)`
// of executor-claude.test.ts):
// opens a real Claude Code process with the login already on the machine (subscription plan), haiku / effort low, a few cents per case at the estimated price.
//   LC_REAL_CLAUDE=1 npx vitest run --project unit server/adapters/executors/claude/claude-agent-executor.real.test.ts
// The child process env drops every CLAUDE* variable of the parent session (the real console does not have them - restart-console.ps1 filters them too), except
// CLAUDE_CONFIG_DIR. The test does not rely on a file written by the background command (an orphaned background command can still write it): it relies on the summary AFTER
// the wake-up, the duration, and the last line of the transcript `<session_id>.jsonl` - `cost-state` is only there when the process EXITS cleanly on its own.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExecutionEvent, ExecutionInput } from '../../../ports/executor';
import { ClaudeAgentExecutor, cleanupMessage, type ClaudeAgentExecutorOptions } from './claude-agent-executor';

const REAL = process.env.LC_REAL_CLAUDE === '1';
const TEST_TIMEOUT = 300_000;

const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^CLAUDE/i.test(k) || k === 'CLAUDE_CONFIG_DIR'));

type Result = Extract<ExecutionEvent, { type: 'result' }>;

async function run(prompt: string, opts: ClaudeAgentExecutorOptions = {}) {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'lc-real-claude-')));
  const input: ExecutionInput = { runId: 'r', loopId: 'l', executionId: 'e', iteration: 1, prompt, config: { model: 'haiku', effort: 'low' }, cwd };
  const events: ExecutionEvent[] = [];
  const t0 = performance.now();
  for await (const e of new ClaudeAgentExecutor({ env: cleanEnv, ...opts }).execute(input, new AbortController().signal)) events.push(e);
  const sessions = events.filter((e) => e.type === 'session') as Extract<ExecutionEvent, { type: 'session' }>[];
  const logs = events.filter((e) => e.type === 'log').map((e) => (e as { message: string }).message);
  return { events, sessions, logs, result: events.at(-1) as Result, elapsedMs: performance.now() - t0 };
}

/** Finds `<id>.jsonl` under ~/.claude/projects/<directory by cwd>/ (does not guess the directory naming rule). */
function findSessionFile(sessionId: string): string {
  const root = join(homedir(), '.claude', 'projects');
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    const f = join(root, dir.name, `${sessionId}.jsonl`);
    if (dir.isDirectory() && existsSync(f)) return f;
  }
  throw new Error(`${sessionId}.jsonl not found under ${root}`);
}

type Line = { type: string; operation?: string; content?: unknown; message?: { content?: unknown } };

/** The transcript lines, parsed. */
const transcript = (sessionId: string): Line[] =>
  readFileSync(findSessionFile(sessionId), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Line);

/** Text of the `user` lines in the transcript (`message.content` is a string or an array of blocks). */
const userTexts = (lines: Line[]): string[] =>
  lines
    .filter((l) => l.type === 'user')
    .map((l) => {
      const c = l.message?.content;
      if (typeof c === 'string') return c;
      return Array.isArray(c) ? c.map((b) => (typeof b === 'object' && b !== null && 'text' in b ? String((b as { text: unknown }).text) : '')).join('') : '';
    });

/** The part of the over-ceiling error text right before the list of descriptions of the stopped tasks. */
const STOPPED_MARK = 'stopped: ';

describe.skipIf(!REAL)('ClaudeAgentExecutor on real Claude Code - background tasks', () => {
  it(
    '(R-a) the agent runs a background command then ends its turn → the turn keeps waiting; the summary is the text AFTER the wake-up; the process exits cleanly on its own',
    async () => {
      const token = `LC${randomBytes(4).toString('hex').toUpperCase()}`;
      const r = await run(
        `Use the Bash tool with run_in_background=true to run exactly one command: sleep 20 && echo ${token}\n` +
          'Once it is started, end your turn at once, replying with exactly two words: STILL WAITING\n' +
          'Later, when Claude Code reports that the background command has finished, read its output and reply with exactly one line: ALL DONE <output>',
      );
      const sessionId = r.sessions[0]!.sessionId;
      console.log(`[R-a] session ${sessionId} · ${(r.elapsedMs / 1000).toFixed(1)} s · cost ${r.result.costUsd} USD · summary «${r.result.summary}» · log ${JSON.stringify(r.logs)}`);

      expect(r.sessions, 'exactly one session event').toHaveLength(1);
      expect(r.result.outcome).toBe('succeeded');
      expect(r.result.summary, 'the summary is the text after the wake-up, not "STILL WAITING"').toContain('ALL DONE');
      expect(r.result.summary, 'with the output of the background command').toContain(token);
      expect(r.result.costUsd).toBeGreaterThan(0);
      expect(r.elapsedMs, 'the turn waits until the background command finishes (sleep 20)').toBeGreaterThanOrEqual(20_000);
      expect(r.logs).toEqual([`Start round #1 · session ${sessionId}`, expect.stringMatching(/^End · Success · [$]\d/)]);
      const lines = transcript(sessionId);
      expect(lines.at(-1)?.type, 'last transcript line = the process exited cleanly on its own').toBe('cost-state');
      expect(userTexts(lines).filter((t) => t.startsWith('[Castraferrum]')), 'the background command finished normally: the console sends no cleanup message').toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    '(R-b) a background command hangs past the ceiling → stopTask while the input is still open → cleanup message → the agent gets one last turn; the process exits cleanly; the turn is failed "Waited more than 20 seconds for background tasks - stopped: …", the summary is the cleanup reply',
    async () => {
      const r = await run(
        'Use the Bash tool with run_in_background=true to run exactly one command: sleep 600\n' +
          'Once it is started, end your turn at once, replying with exactly two words: STILL WAITING\n' +
          'If you are told the background tasks were stopped, reply only: CLEANED UP',
        { bgWaitCeilingMs: 20_000 },
      );
      const sessionId = r.sessions[0]!.sessionId;
      const lines = transcript(sessionId);
      const notes = lines.filter((l) => l.type === 'queue-operation' && l.operation === 'enqueue' && String(l.content).includes('<task-notification>'));
      console.log(`[R-b] session ${sessionId} · ${(r.elapsedMs / 1000).toFixed(1)} s · cost ${r.result.costUsd} USD · error «${r.result.error}» · summary «${r.result.summary}» · log ${JSON.stringify(r.logs)}`);
      console.log(`[R-b] task-notification in the transcript: ${JSON.stringify(notes.map((n) => n.content))}`);

      expect(r.sessions).toHaveLength(1);
      expect(r.result.outcome).toBe('failed');
      expect(r.result.error).toMatch(/^Waited more than 20 seconds for background tasks - stopped: .+/);
      // Over the ceiling: the console stops the tasks then sends the cleanup message - after `stopTask` Claude Code does not wake the agent itself
      // (measured 20/10/2026). The summary is the reply of the cleanup turn, no longer the "STILL WAITING" of result #1.
      expect(r.result.summary, 'summary = the reply of the cleanup turn').toContain('CLEANED UP');
      expect(r.result.costUsd).toBeGreaterThan(0);
      expect(r.elapsedMs, 'not earlier than the ceiling').toBeGreaterThanOrEqual(20_000);
      expect(r.elapsedMs, 'ceiling + 120 seconds').toBeLessThan(20_000 + 120_000);
      expect(r.logs).toEqual([`Start round #1 · session ${sessionId}`, `Error · ${r.result.error}`, expect.stringMatching(/^End · Error · [$]\d/)]);
      // stopTask reached Claude Code (input still open) and it stopped the task: a "killed … stopped by the user" notification entered the queue.
      expect(notes, 'exactly one task-stop notification').toHaveLength(1);
      expect(String(notes[0]!.content)).toMatch(/<status>killed<\/status>/);
      expect(String(notes[0]!.content)).toMatch(/was stopped by the user/);
      // The transcript has exactly ONE `user` line carrying the console's cleanup message, verbatim (ceiling + descriptions of the stopped tasks).
      const error = String(r.result.error);
      const stopped = error.slice(error.indexOf(STOPPED_MARK) + STOPPED_MARK.length).split(', ');
      expect(userTexts(lines).filter((t) => t === cleanupMessage(20_000, stopped)), 'exactly one cleanup message, with the spec wording').toHaveLength(1);
      expect(lines.at(-1)?.type, 'the process exited cleanly (not killed)').toBe('cost-state');
    },
    TEST_TIMEOUT,
  );
});
