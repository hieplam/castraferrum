// Command lines of the gate (spec decisions 31, 34). Pure functions, no Node module.

/**
 * One command line of `goals/gate.json` or a verify file, as an argv that runs it in the shell of the platform.
 * On win32 the runner must pass the argv with `windowsVerbatimArguments`: `/s` then removes the one outer pair of
 * quotes, and `cmd.exe` sees the line as written. With Node's own escaping, an inner quote becomes a different command.
 */
export function shellArgv(line: string, platform: string): string[] {
  return platform === 'win32' ? ['cmd.exe', '/d', '/s', '/c', `"${line}"`] : ['sh', '-c', line];
}

const VISUAL_PROJECT = /--project\s+visual(?![\w-])/;
const BUILD_FIRST = /^\s*npm run build\s*&&/;

/** Why a `stub.run` line must not run, or `null`. A whole e2e run takes 19 minutes, and a new worktree has no build. */
export function stubCommandProblem(line: string): string | null {
  if (line.includes('test:e2e')) return 'a stub run must not hold test:e2e';
  if (line.includes('npm run verify')) return 'a stub run must not hold npm run verify';
  if (/playwright/i.test(line) && !VISUAL_PROJECT.test(line)) return 'a stub run with playwright must use --project visual';
  if (VISUAL_PROJECT.test(line) && !BUILD_FIRST.test(line)) return 'a stub run with --project visual must start with npm run build &&';
  return null;
}

/** The exits of a command that was not found or cannot be run: on Unix 126, 127; in a cmd.exe batch file 9009. */
const NOT_RUN_EXITS = new Set([126, 127, 9009]);
/** `cmd.exe /c` exits 1 for a command that it cannot find, so only its text tells. The text is the English one. */
const CMD_NOT_FOUND = /is not recognized as an internal or external command/;

/** True only when the command ran and failed. Any other failure says nothing about the code under test. */
export function isRealRed(result: { exitCode: number | null; stderr: string; timedOut: boolean; error: string | null }): boolean {
  if (result.exitCode === null || result.exitCode === 0) return false;
  if (result.timedOut || result.error !== null) return false;
  return !NOT_RUN_EXITS.has(result.exitCode) && !CMD_NOT_FOUND.test(result.stderr);
}
