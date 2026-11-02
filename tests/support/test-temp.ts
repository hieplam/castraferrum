// The temp folder of test runs on Windows (issue 387). Storage Sense removes an empty folder in the user temp folder at any age, when free disk space is low.
// A test run keeps empty folders there (`TEST_REPO_DIR`, a folder before its first file), so a run lost them while it ran. Both test configs call `useTestTemp()`,
// so `os.tmpdir()` moves for each test, each worker and each child process. The folder is not in a worktree, because a git command in a test folder must not find a repository.
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

/** The temp folder of one worktree, or `null` where no cleaner reads the temp folder: only Windows has one, and CI uses Linux. */
export function testTempFolder(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, cwd: string): string | null {
  if (platform !== 'win32' || !env.LOCALAPPDATA) return null;
  return join(env.LOCALAPPDATA, 'castraferrum-test-temp', basename(cwd));
}

/** Points `TEMP` and `TMP` of this process at the folder, so children get them too. Gives the two values, for a server that a config starts with its own `env`. */
export function useTestTemp(): Record<string, string> {
  const dir = testTempFolder(process.env, process.platform, process.cwd());
  if (dir === null) return {};
  mkdirSync(dir, { recursive: true });
  const env = { TEMP: dir, TMP: dir };
  Object.assign(process.env, env);
  return env;
}
