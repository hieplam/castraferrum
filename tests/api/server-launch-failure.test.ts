// A failed ServerProcess.launch must not leave a live handle behind (issue 443). The Postgres proxy that launch starts keeps
// the event loop of the caller alive, so `npm run phone:check` hung for 80 minutes after the server failed to start.
// The caller below catches the error and then only waits for its own event loop to end: it exits by itself when launch cleaned up.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const CALLER = `
import { ServerProcess } from './tests/support/server-process.ts';
try {
  await ServerProcess.launch({ env: { LOOPS_TRANSCRIPT_PAGE: '0' } });
  console.log('LAUNCHED');
} catch (e) {
  console.log('LAUNCH_FAILED');
}
`;

describe('ServerProcess.launch after a failed start', () => {
  it('lets the process end: the proxy and the child are stopped', () => {
    const res = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', CALLER], {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      timeout: 60_000,
    });
    expect(res.error).toBeUndefined(); // a hang shows here as ETIMEDOUT
    expect(res.stdout).toContain('LAUNCH_FAILED');
    expect(res.status).toBe(0);
  }, 90_000);
});
