// The tunnel runner with the fake connector tests/support/fake-cloudflared.mjs (remote-access spec G5, G9, D9).
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TunnelState } from '../../ports/tunnel';
import { CloudflaredRunner, INSTALL_HINT, redactToken } from './cloudflared-runner';

const FAKE = fileURLToPath(new URL('../../../tests/support/fake-cloudflared.mjs', import.meta.url));
const TOKEN = 'fake-tunnel-token-for-tests-not-a-secret';

const cleanups: (() => Promise<unknown> | unknown)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A delay that the test releases by hand: the clock is wound, not waited for. */
function woundDelay() {
  const asked: number[] = [];
  const pending: (() => void)[] = [];
  return {
    asked,
    release: () => pending.shift()?.(),
    delay: (ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        asked.push(ms);
        pending.push(resolve);
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  };
}

function runner(opts: { token?: string; env?: Record<string, string>; command?: string[]; delay?: (ms: number, s: AbortSignal) => Promise<void> } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-cloudflared-'));
  const report = join(dir, 'report.json');
  const lines: string[] = [];
  const states: TunnelState[] = [];
  const r = new CloudflaredRunner({
    token: opts.token ?? TOKEN,
    command: opts.command ?? [process.execPath, FAKE],
    env: { ...process.env, LOOPS_CLOUDFLARE: opts.token ?? TOKEN, FAKE_CLOUDFLARED_REPORT: report, ...opts.env },
    log: (line) => lines.push(line),
    onState: (s) => states.push(s),
    pollMs: 50,
    ...(opts.delay ? { delay: opts.delay } : {}),
  });
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  cleanups.push(() => r.stop());
  const readReport = () => JSON.parse(readFileSync(report, 'utf8')) as { pid: number; argv: string[]; token: string };
  return { r, lines, states, report, readReport };
}

describe('CloudflaredRunner (spec D9)', () => {
  it('is off before start', () => {
    expect(runner().r.state()).toBe('off');
  });

  it('gives the token only in TUNNEL_TOKEN: not in the arguments, not in LOOPS_CLOUDFLARE of the child', async () => {
    const { r, report, readReport } = runner();
    await r.start();
    await vi.waitFor(() => expect(existsSync(report)).toBe(true));
    const seen = readReport();
    expect(seen.token).toBe(TOKEN);
    expect(seen.argv.slice(0, 3)).toEqual(['tunnel', '--no-autoupdate', '--metrics']);
    expect(seen.argv[3]).toMatch(/^127\.0\.0\.1:\d+$/);
    expect(seen.argv[4]).toBe('run');
    expect(seen.argv.join(' ')).not.toContain(TOKEN.slice(0, 9));
  });

  it('reports connecting, then connected when /ready answers 200', async () => {
    const { r, states } = runner();
    await r.start();
    expect(r.state()).toBe('connecting');
    await vi.waitFor(() => expect(r.state()).toBe('connected'), { timeout: 10_000 });
    expect(states).toEqual(['connecting', 'connected']);
  });

  it('forwards each line with the prefix [cloudflared] and never the token or a part of it longer than 8 characters', async () => {
    const { r, lines } = runner({ env: { FAKE_CLOUDFLARED_ECHO_TOKEN: '1' } });
    await r.start();
    await vi.waitFor(() => expect(lines.some((l) => l.includes('Registered tunnel connection'))).toBe(true), { timeout: 10_000 });
    const forwarded = lines.filter((l) => l.startsWith('[cloudflared] '));
    expect(forwarded.some((l) => l.includes('token=') && l.includes('part='))).toBe(true);
    for (const line of lines) {
      for (let i = 0; i + 9 <= TOKEN.length; i++) expect(line).not.toContain(TOKEN.slice(i, i + 9));
    }
  });

  it('after an exit: down, then starts again after 1, 2 and 4 seconds of a wound clock', async () => {
    const wound = woundDelay();
    const { r, lines, states } = runner({ token: 'bad', delay: wound.delay });
    await r.start();
    await vi.waitFor(() => expect(wound.asked).toEqual([1000]), { timeout: 10_000 });
    expect(r.state()).toBe('down');
    expect(lines.some((l) => l.startsWith('[cloudflared] ') && l.includes('Unauthorized: Invalid tunnel secret'))).toBe(true);
    wound.release();
    await vi.waitFor(() => expect(wound.asked).toEqual([1000, 2000]), { timeout: 10_000 });
    wound.release();
    await vi.waitFor(() => expect(wound.asked).toEqual([1000, 2000, 4000]), { timeout: 10_000 });
    expect(states.filter((s) => s === 'connecting')).toHaveLength(3);
    expect(states.filter((s) => s === 'down')).toHaveLength(3);
  });

  it('stop() ends the child in 5 seconds, and it is not started again', async () => {
    const { r, readReport } = runner();
    await r.start();
    await vi.waitFor(() => expect(r.state()).toBe('connected'), { timeout: 10_000 });
    const { pid } = readReport();
    expect(alive(pid)).toBe(true);
    const t = Date.now();
    await r.stop();
    expect(Date.now() - t).toBeLessThan(5_000);
    expect(alive(pid)).toBe(false);
    expect(r.state()).toBe('off');
    await new Promise((done) => setTimeout(done, 1_500));
    expect(r.state()).toBe('off');
  });

  it('a program that does not exist (ENOENT): start() rejects with the winget install command', async () => {
    const { r } = runner({ command: [join(tmpdir(), 'no-such-dir', 'cloudflared-missing.exe')] });
    await expect(r.start()).rejects.toThrow(INSTALL_HINT);
    expect(INSTALL_HINT).toContain('winget install --id Cloudflare.cloudflared');
    expect(r.state()).toBe('down');
  });
});

describe('redactToken', () => {
  it('replaces the token and each part of it longer than 8 characters, and keeps the rest of the line', () => {
    expect(redactToken(`a ${TOKEN} b`, TOKEN)).toBe('a *** b');
    expect(redactToken(`x=${TOKEN.slice(3, 20)} y`, TOKEN)).toBe('x=*** y');
    expect(redactToken(`short ${TOKEN.slice(0, 8)} ok`, TOKEN)).toBe(`short ${TOKEN.slice(0, 8)} ok`);
    expect(redactToken('INF Registered tunnel connection', TOKEN)).toBe('INF Registered tunnel connection');
  });
});
