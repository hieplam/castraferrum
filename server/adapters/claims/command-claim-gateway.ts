import type { ClaimConfig, ClaimGateway, ClaimResult, ReleaseWhy, TaskRef } from '../../ports/claims';
import type { CommandResult, CommandRunner } from '../../ports/command-runner';

const TIMEOUT_MS = 30_000;

/** Without it, a plain `release` reopens a closed task (spec 2.4). So a stored argv cannot leave it out. */
const IF_CLAIMED = '--if-claimed';
const EXCUSED = '--excused';

const fill = (argv: string[], key: string, reason = ''): string[] => argv.map((a) => a.replaceAll('{key}', key).replaceAll('{reason}', reason));

/** Runs the argv commands of a loop's probe row (spec 2.4, decision 23). An empty argv does nothing. */
export class CommandClaimGateway implements ClaimGateway {
  readonly #commands: CommandRunner;

  constructor(commands: CommandRunner) {
    this.#commands = commands;
  }

  async claim(cfg: ClaimConfig, task: TaskRef): Promise<ClaimResult> {
    if (cfg.claim.length === 0) return { ok: true };
    const res = await this.#run(fill(cfg.claim, task.key), cfg.cwd);
    if (res.exitCode === 0) return { ok: true };
    // The command was killed while it ran, so the claim can be on the task. The caller keeps the row, and the tick releases it as an orphan.
    if (res.timedOut) throw new Error(`Claim of task ${task.key} timed out after ${TIMEOUT_MS / 1000} s`);
    return { ok: false, reason: failure(res) };
  }

  async release(cfg: ClaimConfig, task: Pick<TaskRef, 'key'>, why: ReleaseWhy): Promise<void> {
    if (cfg.release.length === 0) return;
    const argv = fill(cfg.release, task.key, why.reason);
    if (!argv.includes(IF_CLAIMED)) argv.push(IF_CLAIMED);
    if (why.excused) argv.push(EXCUSED);
    const res = await this.#run(argv, cfg.cwd);
    if (res.exitCode !== 0) throw new Error(`Release of task ${task.key} failed: ${failure(res)}`);
  }

  #run(argv: string[], cwd: string): Promise<CommandResult> {
    return this.#commands.run({ argv, cwd, timeoutMs: TIMEOUT_MS });
  }
}

function failure(res: CommandResult): string {
  if (res.timedOut) return `timed out after ${TIMEOUT_MS / 1000} s`;
  const line = `${res.stderr}\n${res.stdout}`.split(/\r?\n/).find((l) => l.trim() !== '');
  return line?.trim() ?? res.error ?? `exit ${res.exitCode}`;
}
