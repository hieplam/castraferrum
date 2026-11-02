// Issue 387: a test run keeps its temp folders out of the reach of Storage Sense, which removes an empty folder in the user temp folder.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { testTempFolder } from '../support/test-temp';

describe('the temp folder of a test run', () => {
  it('Windows: one folder for each worktree, in the local app data folder and not in its Temp folder', () => {
    const dir = testTempFolder({ LOCALAPPDATA: join('root', 'Local') }, 'win32', join('repo', 'castraferrum-x'));
    expect(dir).toBe(join('root', 'Local', 'castraferrum-test-temp', 'castraferrum-x'));
  });

  it('control: another platform keeps its temp folder', () => {
    expect(testTempFolder({ LOCALAPPDATA: 'root' }, 'linux', 'repo')).toBeNull();
  });

  it('control: Windows with no LOCALAPPDATA keeps its temp folder', () => {
    expect(testTempFolder({}, 'win32', 'repo')).toBeNull();
  });

  it('this run, a new folder and a child process use the same temp folder, and it is the one of this worktree where the platform has one', () => {
    const expected = testTempFolder(process.env, process.platform, process.cwd()) ?? tmpdir();
    expect(tmpdir()).toBe(expected);
    const dir = mkdtempSync(join(tmpdir(), 'lc-test-temp-'));
    expect(dirname(dir)).toBe(expected);
    rmSync(dir, { recursive: true, force: true });
    const child = spawnSync(process.execPath, ['-e', `process.stdout.write(require('node:os').tmpdir())`], { encoding: 'utf8' });
    expect(basename(child.stdout)).toBe(basename(expected));
    expect(child.stdout).toBe(expected);
  });
});
