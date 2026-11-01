import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeCommandRunner } from './node-command-runner';

const node = process.execPath;
const runner = new NodeCommandRunner();
const cwd = process.cwd();
const started: number[] = [];

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(() => {
  // Only pids that a test itself started and read back are killed here.
  for (const pid of started.splice(0)) {
    if (alive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }
});

describe('NodeCommandRunner', () => {
  it('returns exit code 0 and stdout for a command that succeeds', async () => {
    const r = await runner.run({ argv: [node, '-e', 'process.stdout.write("hello")'], cwd, timeoutMs: 10_000 });
    expect(r).toEqual({ exitCode: 0, stdout: 'hello', stderr: '', timedOut: false, error: null });
  });

  it('returns a non-zero exit code and stderr', async () => {
    const r = await runner.run({
      argv: [node, '-e', 'process.stderr.write("boom"); process.exit(3)'],
      cwd,
      timeoutMs: 10_000,
    });
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toBe('boom');
    expect(r.timedOut).toBe(false);
    expect(r.error).toBeNull();
  });

  it('passes the argument "a && echo hacked" as one literal, with no shell', async () => {
    const r = await runner.run({
      argv: [node, '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', 'a && echo hacked'],
      cwd,
      timeoutMs: 10_000,
    });
    expect(JSON.parse(r.stdout)).toEqual(['a && echo hacked']);
  });

  it('returns a null exit code and an error for a missing binary', async () => {
    const r = await runner.run({ argv: ['no-such-binary-lc-p1'], cwd, timeoutMs: 10_000 });
    expect(r.exitCode).toBeNull();
    expect(r.error).toMatch(/ENOENT/);
    expect(r.timedOut).toBe(false);
  });

  it('returns a null exit code and an error for an empty argv', async () => {
    const r = await runner.run({ argv: [], cwd, timeoutMs: 10_000 });
    expect(r.exitCode).toBeNull();
    expect(r.error).toMatch(/argv/);
  });

  it('kills a hung command at the time-out', async () => {
    const t0 = Date.now();
    const r = await runner.run({ argv: [node, '-e', 'setInterval(() => {}, 1000)'], cwd, timeoutMs: 500 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull();
    expect(Date.now() - t0).toBeLessThan(500 + 2000);
  });

  it('kills the whole tree: a grandchild that holds stdout does not delay the result and does not survive', async () => {
    // On Windows the grandchild is detached on purpose: the harness job object kills attached children, which would hide a missing tree kill.
    const grandchild = 'setInterval(() => {}, 1000)';
    const parent =
      `const { spawn } = require("node:child_process");` +
      `const c = spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: ["ignore", "inherit", "inherit"], detached: ${process.platform === "win32"} });` +
      `process.stdout.write("pid=" + c.pid + ";");` +
      `setInterval(() => {}, 1000);`;
    const t0 = Date.now();
    const r = await runner.run({ argv: [node, '-e', parent], cwd, timeoutMs: 1500 });
    const elapsed = Date.now() - t0;
    const pid = Number(/pid=(\d+)/.exec(r.stdout)?.[1]);
    expect(Number.isInteger(pid)).toBe(true);
    started.push(pid);
    expect(r.timedOut).toBe(true);
    expect(elapsed).toBeLessThan(1500 + 2000);
    // Give the operating system a moment to finish removing the killed process.
    const deadline = Date.now() + 3000;
    while (alive(pid) && Date.now() < deadline) await new Promise((res) => setTimeout(res, 50));
    expect(alive(pid)).toBe(false);
  }, 15_000);

  it('uses the given cwd and env', async () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'lc-cmd-')));
    try {
      const r = await runner.run({
        argv: [node, '-e', 'process.stdout.write(process.cwd() + "|" + process.env.LC_P1_VALUE)'],
        cwd: dir,
        env: { LC_P1_VALUE: 'xyz' },
        timeoutMs: 10_000,
      });
      expect(r.stdout).toBe(`${dir}|xyz`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the last maxBytes of output, so the last line survives', async () => {
    const r = await runner.run({
      argv: [node, '-e', 'for (let i = 0; i < 2000; i++) console.log("line " + i);'],
      cwd,
      timeoutMs: 10_000,
      maxBytes: 100,
    });
    expect(Buffer.byteLength(r.stdout)).toBeLessThanOrEqual(100);
    expect(r.stdout.trimEnd().endsWith('line 1999')).toBe(true);
    expect(r.stdout).not.toContain('line 0\n');
  });
});

