// Texts the server emits at run time (executor log lines, skip reasons, fake-Claude summary). The e2e tests assert
// them verbatim, so they live in this ONE file: when the server's texts change, change them here only.
// Sources: server/services/run-service.ts (skip reason), server/adapters/executors/claude/claude-agent-executor.ts (log lines),
// server/adapters/executors/claude/test-mode-query.ts (soak summary), server/adapters/executors/mock/mock-executor.ts.

/** Skip reason when N parallel runs are already going (N > 1): lists the rounds still running. */
export const skipParallel = (limit: number, rounds: string): string => `${limit} parallel runs already going (rounds ${rounds} still running)`;
/** Skip reason for N = 1: `rounds` is e.g. `#1`. */
export const skipSingle = (rounds: string): string => `round ${rounds} still running`;
/** Summary the fake Claude returns after soaking `seconds`. */
export const soakSummary = (seconds: number): string => `soak finished after ${seconds} seconds`;
/** First log line of a Claude run. */
export const claudeStartLog = (iteration: number, sessionId: string): string => `Start round #${iteration} · session ${sessionId}`;
/** Last log line of a successful Claude run, before the cost. */
export const CLAUDE_END_OK_PREFIX = 'End · Success · ';
/** Error log line prefix. */
export const ERROR_LOG_PREFIX = 'Error · ';
/** Error + log line when a run exceeds timeoutSec. */
export const timeoutError = (seconds: number): string => `Timed out (${seconds} seconds) - cancelled`;
/** Last log line of a Mock run that finished. */
export const MOCK_DONE_LOG = 'Done (simulated)';
/** Error of a Mock run that was told to fail. */
export const MOCK_FAIL_ERROR = 'Simulated error';
/** Name the server gives a duplicated loop (the "(copy)" suffix). */
export const copyName = (name: string): string => `${name} (copy)`;
