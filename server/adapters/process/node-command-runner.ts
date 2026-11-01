import { spawn, spawnSync } from 'node:child_process';
import type { CommandRequest, CommandResult, CommandRunner } from '../../ports/command-runner';

const DEFAULT_MAX_BYTES = 1024 * 1024;
/** After the kill, the result is returned at most this long later, also when no `close` event comes. */
const KILL_GRACE_MS = 1000;

/** Keeps the last `max` bytes that were written to it. */
class TailBuffer {
  private chunks: Buffer[] = [];
  private size = 0;
  constructor(private readonly max: number) {}

  push(chunk: Buffer): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
    if (this.size > this.max * 2) this.trim();
  }

  private trim(): void {
    const all = Buffer.concat(this.chunks);
    const kept = all.subarray(Math.max(0, all.length - this.max));
    this.chunks = [kept];
    this.size = kept.length;
  }

  text(): string {
    this.trim();
    return this.chunks[0]?.toString('utf8') ?? '';
  }
}

function killTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      // The child leads its own process group (`detached`), so a negative pid reaches the grandchildren too.
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    /* the process is already gone */
  }
}

/** Runs a command with `spawn`, no shell, and no model. A hung command is killed with its whole tree at the time-out. */
export class NodeCommandRunner implements CommandRunner {
  run(req: CommandRequest): Promise<CommandResult> {
    const [program, ...args] = req.argv;
    if (!program) {
      return Promise.resolve({ exitCode: null, stdout: '', stderr: '', timedOut: false, error: 'argv is empty' });
    }
    const max = req.maxBytes ?? DEFAULT_MAX_BYTES;
    return new Promise<CommandResult>((resolve) => {
      const out = new TailBuffer(max);
      const err = new TailBuffer(max);
      let timedOut = false;
      let error: string | null = null;
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      let graceTimer: NodeJS.Timeout | undefined;

      const finish = (exitCode: number | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(graceTimer);
        resolve({ exitCode, stdout: out.text(), stderr: err.text(), timedOut, error });
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(program, args, {
          cwd: req.cwd,
          env: { ...process.env, ...req.env },
          shell: false,
          windowsHide: true,
          windowsVerbatimArguments: req.windowsVerbatimArguments ?? false,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        finish(null);
        return;
      }
      child.stdout?.on('data', (c: Buffer) => out.push(c));
      child.stderr?.on('data', (c: Buffer) => err.push(c));
      child.on('error', (e) => {
        error = e.message;
        finish(null);
      });
      // `close` waits for the streams, which a surviving grandchild can hold open. `exit` only reports the exit code.
      child.on('close', (code) => finish(timedOut ? null : code));

      timer = setTimeout(() => {
        timedOut = true;
        if (child.pid !== undefined) killTree(child.pid);
        graceTimer = setTimeout(() => finish(null), KILL_GRACE_MS);
      }, req.timeoutMs);
    });
  }
}
