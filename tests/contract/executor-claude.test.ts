// Executor contract suite on ClaudeAgentExecutor, two variants sharing the same cases as Mock:
//   - `claude (fake query)`: always runs, `query` is an injected fake (tests/support/fake-claude-query.ts) - costs nothing.
//   - `claude (real)`: only when LC_REAL_CLAUDE=1 - opens a real Claude Code process using the login already on the machine (subscription plan),
//     model haiku / effort low to keep it cheap; the env deliberately has a fake ANTHROPIC_API_KEY to prove the executor does not use a key.
// The success case checks more (checkSucceeded): fake variant - the options passed to the SDK; real variant - `ok.txt` sits in the right `cwd`,
// a `<session_id>.jsonl` file exists under ~/.claude/projects/, costUsd > 0.
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, vi } from 'vitest';
import { ClaudeAgentExecutor } from '../../server/adapters/executors/claude/claude-agent-executor';
import type { ExecutionEvent } from '../../server/ports/executor';
import { fakeQuery, type FakeQuery } from '../support/fake-claude-query';
import { executorContract } from './executor.contract';

const REAL = process.env.LC_REAL_CLAUDE === '1';
if (REAL) vi.setConfig({ testTimeout: 240_000 });

const resultOf = (events: ExecutionEvent[]) => events.at(-1) as Extract<ExecutionEvent, { type: 'result' }>;
const sessionOf = (events: ExecutionEvent[]) => (events[0] as Extract<ExecutionEvent, { type: 'session' }>).sessionId;

/** Find `<id>.jsonl` under ~/.claude/projects/<cwd-derived dir>/ (without guessing the directory naming rule). */
function findSessionFile(sessionId: string): string | null {
  const root = join(homedir(), '.claude', 'projects');
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const f = join(root, dir.name, `${sessionId}.jsonl`);
    if (existsSync(f)) return f;
  }
  return null;
}

describe('executor contract', () => {
  describe('claude (fake query)', () => {
    let q: FakeQuery;
    executorContract(() => {
      q = fakeQuery();
      return {
        make: () => new ClaudeAgentExecutor({ query: q, env: () => ({ PATH: 'p', ANTHROPIC_API_KEY: 'sk-fake' }) }),
        succeeding: { prompt: 'Do the work', config: { model: 'haiku', effort: 'low' } },
        failing: { prompt: 'Do the work [fail]', config: {} },
        long: { prompt: 'Do the work [long]', config: {} },
        invalidConfig: { model: 'gpt-5' },
        runWithinMs: 2000,
        checkSucceeded(input, events) {
          expect(q.calls).toHaveLength(1);
          const { options, sent, inputClosed } = q.calls[0]!;
          // Streaming input: exactly ONE user message = the loop prompt, then the executor closes the input when the turn is done.
          expect(sent).toHaveLength(1);
          expect(sent[0]).toMatchObject({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: input.prompt } });
          expect(inputClosed).toBe(true);
          expect(options).toMatchObject({
            cwd: input.cwd,
            model: 'haiku',
            effort: 'low',
            permissionMode: 'bypassPermissions',
            allowDangerouslySkipPermissions: true,
            systemPrompt: { type: 'preset', preset: 'claude_code' },
            env: { PATH: 'p' },
          });
          expect(options.env).not.toHaveProperty('ANTHROPIC_API_KEY');
          expect(options).not.toHaveProperty('settingSources'); // left empty = load everything like Claude Code
          expect(options).not.toHaveProperty('maxTurns');
          expect(options).not.toHaveProperty('maxBudgetUsd');
          expect(options.abortController).toBeInstanceOf(AbortController);
          expect(resultOf(events)).toEqual({ type: 'result', outcome: 'succeeded', summary: 'done', costUsd: 0.0123 });
          expect(events.filter((e) => e.type === 'log').map((e) => (e as { message: string }).message)).toEqual([
            `Start round #1 · session ${sessionOf(events)}`,
            'End · Success · $0.01',
          ]);
        },
      };
    });
  });

  if (REAL) {
    describe('claude (real)', () => {
      const saved = process.env.ANTHROPIC_API_KEY;
      beforeAll(() => {
        process.env.ANTHROPIC_API_KEY = 'sk-fake'; // the executor must drop this key, otherwise the turn fails with "Invalid API key"
      });
      afterAll(() => {
        if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = saved;
      });
      executorContract(() => ({
        make: () => new ClaudeAgentExecutor(),
        // Genuinely broken login: empty Claude Code config dir -> "Not logged in" (session present, result is an error).
        makeFailing: () => {
          const empty = mkdtempSync(join(tmpdir(), 'lc-claude-nologin-'));
          return new ClaudeAgentExecutor({ env: () => ({ ...process.env, CLAUDE_CONFIG_DIR: empty }) });
        },
        succeeding: {
          prompt: 'Create a file ok.txt in the current directory, content exactly two letters: ok. Do nothing else. When finished, reply with exactly one word: done',
          config: { model: 'haiku', effort: 'low' },
        },
        failing: { prompt: 'Reply: done', config: { model: 'haiku', effort: 'low' } },
        long: { prompt: 'Run the bash command: sleep 600 . Wait for it to finish, then reply: done', config: { model: 'haiku', effort: 'low' } },
        invalidConfig: { effort: 'ultra' },
        runWithinMs: 180_000,
        checkSucceeded(input, events) {
          const ok = join(input.cwd!, 'ok.txt');
          expect(existsSync(ok), `${ok} must exist (the agent runs in the right cwd, permissions bypassed)`).toBe(true);
          expect(readFileSync(ok, 'utf8').trim()).toBe('ok');
          const id = sessionOf(events);
          expect(id).toMatch(/^[0-9a-f-]{36}$/);
          expect(findSessionFile(id), `~/.claude/projects/*/${id}.jsonl`).not.toBeNull();
          const r = resultOf(events);
          expect(r.outcome).toBe('succeeded');
          expect(r.costUsd).toBeGreaterThan(0);
          console.log(`[claude real] session ${id} - cost $${r.costUsd} - summary "${r.summary}" - cwd ${input.cwd}`);
        },
      }));
    });
  }
});
