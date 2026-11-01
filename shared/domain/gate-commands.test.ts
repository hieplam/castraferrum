import { describe, expect, it } from 'vitest';
import { isRealRed, shellArgv, stubCommandProblem } from './gate-commands';

const result = (over: Partial<Parameters<typeof isRealRed>[0]>) => ({ exitCode: 0, stderr: '', timedOut: false, error: null, ...over });

describe('gate_commands', () => {
  it('shellArgv gives cmd.exe on win32, with the line in one outer pair of quotes', () => {
    expect(shellArgv('npm test && echo ok', 'win32')).toEqual(['cmd.exe', '/d', '/s', '/c', '"npm test && echo ok"']);
  });

  it('shellArgv gives sh on every other platform', () => {
    expect(shellArgv('npm test && echo ok', 'linux')).toEqual(['sh', '-c', 'npm test && echo ok']);
    expect(shellArgv('npm test', 'darwin')).toEqual(['sh', '-c', 'npm test']);
  });

  it('stubCommandProblem refuses a line that holds test:e2e', () => {
    expect(stubCommandProblem('npm run test:e2e -- tests/e2e/a.spec.ts')).toMatch(/test:e2e/);
  });

  it('stubCommandProblem refuses npm run verify', () => {
    expect(stubCommandProblem('npm run verify')).toMatch(/npm run verify/);
  });

  it('stubCommandProblem refuses playwright with no --project visual', () => {
    expect(stubCommandProblem('npx playwright test tests/e2e/a.spec.ts')).toMatch(/--project visual/);
    expect(stubCommandProblem('npm run build && npx playwright test --project visual-other')).toMatch(/--project visual/);
  });

  it('stubCommandProblem refuses a visual run with no build first', () => {
    expect(stubCommandProblem('npx playwright test --project visual')).toMatch(/npm run build &&/);
    expect(stubCommandProblem('echo npm run build && npx playwright test --project visual')).toMatch(/npm run build &&/);
  });

  it('stubCommandProblem passes a visual run after a build, and a plain unit run', () => {
    expect(stubCommandProblem('npm run build && npx playwright test --project visual')).toBeNull();
    expect(stubCommandProblem('npx vitest run --project unit tests/tools/a.test.ts')).toBeNull();
  });

  it('isRealRed is true only for a real non-zero exit', () => {
    expect(isRealRed(result({ exitCode: 1 }))).toBe(true);
    expect(isRealRed(result({ exitCode: 2 }))).toBe(true);
    expect(isRealRed(result({ exitCode: 0 }))).toBe(false);
  });

  it('isRealRed is false for a time-out and for a command that did not start', () => {
    expect(isRealRed(result({ exitCode: null, timedOut: true }))).toBe(false);
    expect(isRealRed(result({ exitCode: 1, timedOut: true }))).toBe(false);
    expect(isRealRed(result({ exitCode: null, error: 'spawn ENOENT' }))).toBe(false);
  });

  it('isRealRed is false for command not found: 126, 127, 9009, and the exit 1 of cmd.exe', () => {
    expect(isRealRed(result({ exitCode: 127 }))).toBe(false);
    expect(isRealRed(result({ exitCode: 126 }))).toBe(false);
    expect(isRealRed(result({ exitCode: 9009 }))).toBe(false);
    const stderr = "'nope' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n";
    expect(isRealRed(result({ exitCode: 1, stderr }))).toBe(false);
  });
});
