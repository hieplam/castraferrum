// Runs `cloudflared` as a child process of the console (remote-access spec D9, ADR 0006).
//
// - Command: `<command> tunnel --no-autoupdate --metrics 127.0.0.1:<free port> run`. The token goes only into the child's
//   `TUNNEL_TOKEN`; it is never an argument (a command line is visible to other processes), and `LOOPS_CLOUDFLARE` is removed from
//   the child's environment.
// - Each output line goes to the console log with the prefix `[cloudflared] `, with the token and each part of it longer than
//   8 characters replaced by `***`.
// - State: `connecting` from the start until `GET /ready` on the metrics address answers 200, then `connected`; `down` when the
//   process exits. After an exit that `stop()` did not ask for, it starts again after 1, 2, 4, 8, 16, then every 30 seconds. The
//   backoff starts again at 1 second after a connection.
// - `stop()`: a normal kill, then a forced kill after 5 seconds; it resolves when the process has exited.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import type { TunnelRunner, TunnelState } from '../../ports/tunnel';

/** The message when the program cannot start: what to install. */
export const INSTALL_HINT = 'cloudflared was not found: install it with winget install --id Cloudflare.cloudflared, or set --cloudflared=<path>';

/** The waits between an exit and the next start, in milliseconds; the last one repeats. */
export const RESTART_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];

const STOP_GRACE_MS = 5000;
/** The shortest part of the token that the redaction replaces (a part of 8 characters or less is not a secret by itself). */
const MIN_SECRET_PART = 9;

/** Replaces the token, and each part of it longer than 8 characters, by `***`. */
export function redactToken(line: string, token: string): string {
  if (token === '') return line;
  const out = line.split(token).join('***');
  if (token.length < MIN_SECRET_PART) return out;
  let result = '';
  let i = 0;
  while (i < out.length) {
    let len = 0;
    while (i + len < out.length && token.includes(out.slice(i, i + len + 1))) len++;
    if (len >= MIN_SECRET_PART) {
      result += '***';
      i += len;
    } else {
      result += out[i];
      i++;
    }
  }
  return result;
}

function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

export type CloudflaredRunnerOptions = {
  token: string;
  /** The program and its first arguments: `['cloudflared']`, or `[node, fake.mjs]` (config.ts makes it). */
  command: string[];
  /** Receives each `[cloudflared] ` line and each `Tunnel: <state>` line. */
  log: (line: string) => void;
  onState?: (state: TunnelState) => void;
  /** The environment that the child gets, before `TUNNEL_TOKEN` is set. Default: the console's own. */
  env?: Record<string, string | undefined>;
  /** Waits before a new start. Tests pass a wound clock. */
  delay?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** How often `/ready` is asked while connecting. Default 500 ms. */
  pollMs?: number;
};

export class CloudflaredRunner implements TunnelRunner {
  readonly #opts: CloudflaredRunnerOptions;
  #state: TunnelState = 'off';
  #child: ChildProcess | null = null;
  #exited: Promise<void> = Promise.resolve();
  #stopping = false;
  #attempt = 0;
  #abort = new AbortController();

  constructor(opts: CloudflaredRunnerOptions) {
    this.#opts = opts;
  }

  state(): TunnelState {
    return this.#state;
  }

  async start(): Promise<void> {
    this.#stopping = false;
    this.#abort = new AbortController();
    await this.#spawn();
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    this.#abort.abort();
    const child = this.#child;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill();
      const forced = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS);
      await this.#exited;
      clearTimeout(forced);
    }
    this.#child = null;
    if (this.#state !== 'off') this.#set('off');
  }

  #set(state: TunnelState): void {
    if (this.#state === state) return;
    this.#state = state;
    this.#opts.log(`Tunnel: ${state}`);
    this.#opts.onState?.(state);
  }

  #forward(chunk: Buffer, rest: { text: string }): void {
    rest.text += chunk.toString('utf8');
    const lines = rest.text.split(/\r?\n/);
    rest.text = lines.pop() ?? '';
    for (const line of lines) if (line.trim() !== '') this.#opts.log(`[cloudflared] ${redactToken(line, this.#opts.token)}`);
  }

  async #spawn(): Promise<void> {
    const port = await freeLoopbackPort();
    const [program, ...first] = this.#opts.command;
    if (!program) throw new Error(INSTALL_HINT);
    const env: Record<string, string | undefined> = { ...(this.#opts.env ?? process.env), TUNNEL_TOKEN: this.#opts.token };
    delete env.LOOPS_CLOUDFLARE;
    const child = spawn(program, [...first, 'tunnel', '--no-autoupdate', '--metrics', `127.0.0.1:${port}`, 'run'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const out = { text: '' };
    const err = { text: '' };
    child.stdout?.on('data', (b: Buffer) => this.#forward(b, out));
    child.stderr?.on('data', (b: Buffer) => this.#forward(b, err));
    this.#exited = new Promise((resolve) => child.once('close', () => resolve()));
    this.#child = child;
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve());
      child.once('error', (e: NodeJS.ErrnoException) => {
        this.#child = null;
        this.#set('down');
        reject(e.code === 'ENOENT' ? new Error(INSTALL_HINT) : e);
      });
    });
    this.#set('connecting');
    child.once('close', (code) => {
      for (const rest of [out, err]) if (rest.text.trim() !== '') this.#opts.log(`[cloudflared] ${redactToken(rest.text, this.#opts.token)}`);
      if (this.#child === child) this.#child = null;
      if (this.#stopping) return;
      this.#opts.log(`Tunnel: cloudflared exited with code ${code ?? 'none'}`);
      this.#set('down');
      void this.#restart();
    });
    void this.#watchReady(child, port);
  }

  async #watchReady(child: ChildProcess, port: number): Promise<void> {
    const signal = this.#abort.signal;
    while (this.#child === child && !signal.aborted) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]) });
        await res.arrayBuffer();
        if (res.status === 200 && this.#child === child) {
          this.#attempt = 0;
          this.#set('connected');
          return;
        }
      } catch {
        // not listening yet
      }
      try {
        await sleep(this.#opts.pollMs ?? 500, undefined, { signal });
      } catch {
        return;
      }
    }
  }

  async #restart(): Promise<void> {
    const ms = RESTART_DELAYS_MS[Math.min(this.#attempt, RESTART_DELAYS_MS.length - 1)]!;
    this.#attempt++;
    const signal = this.#abort.signal;
    try {
      await (this.#opts.delay ?? ((t, s) => sleep(t, undefined, { signal: s })))(ms, signal);
    } catch {
      return;
    }
    if (this.#stopping || signal.aborted) return;
    try {
      await this.#spawn();
    } catch (e) {
      this.#opts.log(`Tunnel: ${(e as Error).message}`);
      if (!this.#stopping) void this.#restart();
    }
  }
}
