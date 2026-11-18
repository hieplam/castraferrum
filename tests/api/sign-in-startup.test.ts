// The startup lines of remote-access spec D12 on a real server process (task R1, goal G1): with credentials the server prints
// `Sign-in: on (user u)` and the password appears in none of its output lines; without them, beyond loopback, the warning
// carries the hint to set credentials.
import { describe, expect, it } from 'vitest';
import { NETWORK_WARNING, SIGN_IN_HINT } from '../../server/config';
import { ServerProcess } from '../support/server-process';

describe('sign-in startup lines (spec D12)', () => {
  it('a server started with --username=u --password=password1 prints Sign-in: on (user u) and never the password', async () => {
    const sp = await ServerProcess.launch({ args: ['--username=u', '--password=password1'] });
    try {
      const lines = sp.logs.join('').split(/\r?\n/);
      expect(lines).toContain('Sign-in: on (user u)');
      expect(lines.filter((l) => l.includes('password1'))).toEqual([]);
      expect(lines).not.toContain(NETWORK_WARNING);
    } finally {
      await sp.shutdown();
      await sp.stop();
    }
    expect(sp.logs.join('')).not.toContain('password1');
  }, 60_000);

  it('a server started with --remote and no credentials prints the warning followed by the hint', async () => {
    const sp = await ServerProcess.launch({ args: ['--remote'] });
    try {
      const lines = sp.logs.join('').split(/\r?\n/);
      const at = lines.indexOf(NETWORK_WARNING);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(lines[at + 1]).toBe(SIGN_IN_HINT);
      expect(lines.some((l) => l.startsWith('Sign-in:'))).toBe(false);
    } finally {
      await sp.stop();
    }
  }, 60_000);
});
