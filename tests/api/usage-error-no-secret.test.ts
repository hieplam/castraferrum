// Goal G9: a usage error never echoes a value that can be a secret. `npm start --cloudflare <token>` hands the token to the
// script as a separate word; startup must exit 2 and print no line that holds it.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TOKEN = 'eyJfaketoken-not-a-secret-0123456789';

describe('usage errors keep secrets out of the output', () => {
  it('an unexpected argument exits 2 and no output line holds it', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'server/main.ts', TOKEN], {
      cwd: ROOT,
      env: { ...process.env, LOOPS_TEST_MODE: '1', npm_config_cloudflare: 'true', LOOPS_CLOUDFLARE: '' },
      encoding: 'utf8',
      timeout: 60_000,
    });
    const output = `${run.stdout}${run.stderr}`;
    expect(run.status).toBe(2);
    expect(output).toContain(`unexpected argument (${TOKEN.length} characters)`);
    expect(output.split(/\r?\n/).filter((l) => l.includes('eyJfaketoken'))).toEqual([]);
  }, 90_000);
});
