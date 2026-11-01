import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = 'scripts/logon-task.mjs';
const DIR = 'C:\\Tools\\Castraferrum';

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe('logon-task script, prints Task Scheduler XML and never installs', () => {
  it('has a log-on trigger that waits one minute', () => {
    const { code, out } = run('--console-dir', DIR);
    expect(code).toBe(0);
    expect(out).toContain('<LogonTrigger>');
    expect(out).toContain('<Delay>PT1M</Delay>');
    expect(out).toContain('<LogonType>InteractiveToken</LogonType>');
    expect(out).toContain('<RunLevel>LeastPrivilege</RunLevel>');
    expect(out).toContain('<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>');
  });

  it('runs powershell.exe with npm start in the console folder and the port in LOOPS_PORT', () => {
    const { out } = run('--console-dir', DIR, '--port', '7171');
    expect(out).toContain('<Command>powershell.exe</Command>');
    expect(out).toContain('Set-Location -LiteralPath &apos;C:\\Tools\\Castraferrum&apos;');
    expect(out).toContain('$env:LOOPS_PORT=&apos;7171&apos;');
    expect(out).toContain('npm start');
    const dflt = run('--console-dir', DIR).out;
    expect(dflt).toContain('$env:LOOPS_PORT=&apos;7070&apos;');
  });

  it('escapes & and the single quote in the folder', () => {
    const { code, out } = run('--console-dir', "C:\\Tools\\A&B's");
    expect(code).toBe(0);
    // PowerShell doubles the quote, then XML escapes both characters.
    expect(out).toContain('C:\\Tools\\A&amp;B&apos;&apos;s');
    expect(out).not.toContain('A&B');
  });

  it('exits 2 for a relative --console-dir', () => {
    const r = run('--console-dir', 'relative\\dir');
    expect(r.code).toBe(2);
    expect(r.err).toContain('--console-dir');
    expect(r.out).toBe('');
  });

  it('exits 2 for a bad port', () => {
    for (const p of ['0', '65536', 'abc', '70.5']) {
      const r = run('--console-dir', DIR, '--port', p);
      expect(r.code, p).toBe(2);
      expect(r.err).toContain('--port');
    }
  });

  it('restarts a failed task every minute, 10 times, with no time limit and no stop on battery', () => {
    const { out } = run('--console-dir', DIR);
    expect(out).toMatch(/<RestartOnFailure>\s*<Interval>PT1M<\/Interval>\s*<Count>10<\/Count>\s*<\/RestartOnFailure>/);
    expect(out).toContain('<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>');
    expect(out).toContain('<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>');
    expect(out).toContain('<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>');
  });

  it('--out writes UTF-16 LE with a BOM and prints the schtasks line', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'lc-logon-'));
    try {
      const file = join(tmp, 'task.xml');
      const r = run('--console-dir', DIR, '--task-name', 'Castraferrum', '--out', file);
      expect(r.code).toBe(0);
      const raw = readFileSync(file);
      expect([raw[0], raw[1]]).toEqual([0xff, 0xfe]);
      const text = raw.subarray(2).toString('utf16le');
      expect(text).toContain('<LogonTrigger>');
      expect(r.out.trim()).toBe(`schtasks /Create /TN "Castraferrum" /XML "${file}"`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('source has no child_process import, so it cannot install anything', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).not.toMatch(/child_process/);
    expect(src).not.toMatch(/\bexec(Sync|File)?\s*\(|\bspawn(Sync)?\s*\(/);
  });
});
