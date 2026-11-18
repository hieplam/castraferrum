// The command line of the server process (spec D2, D9): usage errors and --help leave before the database is opened,
// so these tests need no database and no free port.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const MAIN = 'server/main.ts';

/** Runs main.ts without LOOPS_* and npm_config_* variables of the parent: the process leaves before the database. */
function run(args: string[], extraEnv: Record<string, string> = {}) {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !/^(LOOPS_|npm_config_)/.test(k)) env[k] = v;
  }
  const res = spawnSync(process.execPath, ['--import', 'tsx', MAIN, ...args], {
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

describe('server command line', () => {
  it('an unknown flag exits 2 with the reason and the usage on stderr', () => {
    const r = run(['--nope']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('unknown flag --nope');
    expect(r.err).toContain('Usage:');
    expect(r.out).toBe('');
  });

  it('--remote and --host together exit 2', () => {
    const r = run(['--remote', '--host=0.0.0.0']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--remote and --host cannot be used together');
  });

  it('--help exits 0 and prints every flag on stdout', () => {
    const r = run(['--help']);
    expect(r.code).toBe(0);
    for (const flag of ['--host', '--remote', '--port', '--help']) expect(r.out).toContain(flag);
  });

  it('--username alone exits 2 with --password is missing (remote-access spec D1)', () => {
    const r = run(['--username=u']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--password is missing');
  });

  it('--password alone exits 2 with --username is missing, and a short password exits 2 without echoing it', () => {
    const alone = run(['--password=password1']);
    expect(alone.code).toBe(2);
    expect(alone.err).toContain('--username is missing');
    expect(alone.err + alone.out).not.toContain('password1');
    const short = run(['--username=u', '--password=seven77']);
    expect(short.code).toBe(2);
    expect(short.err).toContain('the password needs at least 8 characters');
    expect(short.err + short.out).not.toContain('seven77');
  });

  it('--help lists --username and --password', () => {
    const r = run(['--help']);
    for (const flag of ['--username', '--password']) expect(r.out).toContain(flag);
  });

  it('--help wins over an unreachable database', () => {
    const r = run(['--help'], { DATABASE_URL: 'postgres://nobody:x@127.0.0.1:1/loops' });
    expect(r.code).toBe(0);
  });
});
