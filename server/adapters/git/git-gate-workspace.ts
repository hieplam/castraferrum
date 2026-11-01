import { rmSync } from 'node:fs';
import { devNull } from 'node:os';
import { join } from 'node:path';
import { shellArgv } from '../../../shared/domain/gate-commands';
import { matchesGlob, type ChangedFile } from '../../../shared/domain/scope-guard';
import type { CommandResult, CommandRunner } from '../../ports/command-runner';
import { GateWorkspaceError, type GateTree, type GateWorkspace, type PrepareResult } from '../../ports/gate-workspace';

const GIT_TIMEOUT_MS = 5 * 60_000;
/** The runner keeps the tail of a longer output, so a listing or a file must fit in full. */
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const PATHS_PER_CALL = 50;
const MAIN_REF = 'refs/remotes/origin/main';
const HEAD_REF = 'refs/gate/head';

function textOf(result: CommandResult): string {
  const reason = result.timedOut ? 'git timed out' : result.error;
  return [result.stdout, result.stderr, reason].filter(Boolean).join('\n');
}

/** One entry of `ls-tree -z`: `<mode> <type> <object>\t<path>`. */
function parseTree(stdout: string): { type: string; object: string; path: string }[] {
  return stdout
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf('\t');
      const [, type = '', object = ''] = entry.slice(0, tab).split(' ');
      return { type, object, path: entry.slice(tab + 1) };
    });
}

export class GitGateWorkspace implements GateWorkspace {
  private readonly runner: CommandRunner;
  private readonly root: string;

  constructor(deps: { runner: CommandRunner; root: string }) {
    this.runner = deps.runner;
    this.root = deps.root;
  }

  private git(dir: string, args: string[]): Promise<CommandResult> {
    const argv = [
      'git',
      '--literal-pathspecs',
      '-c',
      `core.hooksPath=${devNull}`,
      '-c',
      'user.name=castraferrum-gate',
      '-c',
      'user.email=gate@castraferrum.invalid',
      '-c',
      'commit.gpgsign=false',
      '-C',
      dir,
      ...args,
    ];
    return this.runner.run({ argv, cwd: dir, timeoutMs: GIT_TIMEOUT_MS, maxBytes: MAX_OUTPUT_BYTES });
  }

  private async must(dir: string, args: string[]): Promise<string> {
    const result = await this.git(dir, args);
    if (result.exitCode !== 0) {
      throw new GateWorkspaceError(`git ${args[0]} failed: ${textOf(result)}`, result.exitCode, result.stderr);
    }
    return result.stdout;
  }

  async fetch(repoPath: string, head: { headRef: string; headSha: string }): Promise<{ mainSha: string; headMatches: boolean }> {
    await this.must(repoPath, ['fetch', '--no-tags', 'origin', `+refs/heads/main:${MAIN_REF}`, `+refs/heads/${head.headRef}:${HEAD_REF}`]);
    const mainSha = (await this.must(repoPath, ['rev-parse', MAIN_REF])).trim();
    const fetchedHead = (await this.must(repoPath, ['rev-parse', HEAD_REF])).trim();
    return { mainSha, headMatches: fetchedHead === head.headSha };
  }

  async readAt(repoPath: string, sha: string, path: string): Promise<string | null> {
    const entries = parseTree(await this.must(repoPath, ['ls-tree', '-z', sha, '--', path]));
    const blob = entries.find((entry) => entry.path === path && entry.type === 'blob');
    return blob ? this.must(repoPath, ['cat-file', 'blob', blob.object]) : null;
  }

  async listAt(repoPath: string, sha: string, dir: string): Promise<string[]> {
    const prefix = `${dir}/`;
    const entries = parseTree(await this.must(repoPath, ['ls-tree', '-z', sha, '--', prefix]));
    return entries
      .filter((entry) => entry.type === 'blob' && entry.path.endsWith('.json'))
      .map((entry) => entry.path.slice(prefix.length))
      .sort();
  }

  async changed(repoPath: string, mainSha: string, headSha: string): Promise<{ mergeBase: string; files: ChangedFile[] }> {
    const mergeBase = (await this.must(repoPath, ['merge-base', mainSha, headSha])).trim();
    const fields = (await this.must(repoPath, ['diff', '--name-status', '--no-renames', '-z', mergeBase, headSha])).split('\0');
    const files: ChangedFile[] = [];
    for (let i = 0; i + 1 < fields.length; i += 2) {
      files.push({ status: fields[i]!, path: fields[i + 1]! });
    }
    return { mergeBase, files };
  }

  async prepare(repoPath: string, jobId: string, mainSha: string, headSha: string): Promise<PrepareResult> {
    const dir = join(this.root, jobId);
    try {
      await this.remove(repoPath, jobId);
      const add = await this.git(repoPath, ['worktree', 'add', '--detach', dir, headSha]);
      if (add.exitCode !== 0) return await this.failed(repoPath, jobId, textOf(add));
      const rebase = await this.git(dir, ['rebase', mainSha]);
      if (rebase.exitCode !== 0) {
        await this.git(dir, ['rebase', '--abort']);
        return await this.failed(repoPath, jobId, textOf(rebase));
      }
      const rebasedSha = (await this.must(dir, ['rev-parse', 'HEAD'])).trim();
      return { ok: true, tree: { dir, baseSha: mainSha, rebasedSha } };
    } catch (e) {
      return this.failed(repoPath, jobId, e instanceof Error ? e.message : String(e));
    }
  }

  private async failed(repoPath: string, jobId: string, output: string): Promise<PrepareResult> {
    try {
      await this.remove(repoPath, jobId);
      return { ok: false, output };
    } catch (e) {
      return { ok: false, output: `${output}\n${e instanceof Error ? e.message : String(e)}` };
    }
  }

  async stubRestore(tree: GateTree, files: ChangedFile[], testGlobs: string[]): Promise<string[]> {
    const paths = [...new Set(files.map((file) => file.path))].filter((path) => !matchesGlob(path, testGlobs));
    const atBase = new Set((await this.must(tree.dir, ['ls-tree', '-r', '-z', '--name-only', tree.baseSha])).split('\0'));
    // Deletes go first: a path of the PR can stand where the base has a file with the name of its folder.
    for (const path of paths) {
      if (!atBase.has(path)) rmSync(join(tree.dir, path), { force: true });
    }
    const toCheckout = paths.filter((path) => atBase.has(path));
    for (let i = 0; i < toCheckout.length; i += PATHS_PER_CALL) {
      await this.must(tree.dir, ['checkout', tree.baseSha, '--', ...toCheckout.slice(i, i + PATHS_PER_CALL)]);
    }
    return paths;
  }

  async stubUndo(tree: GateTree): Promise<void> {
    await this.must(tree.dir, ['reset', '-q', '--hard', tree.rebasedSha]);
    await this.must(tree.dir, ['clean', '-fdq']);
  }

  run(tree: GateTree, command: { line: string; env: Record<string, string>; timeoutMs: number }): Promise<CommandResult> {
    return this.runner.run({
      argv: shellArgv(command.line, process.platform),
      cwd: tree.dir,
      env: command.env,
      timeoutMs: command.timeoutMs,
      windowsVerbatimArguments: true,
    });
  }

  async remove(repoPath: string, jobId: string): Promise<void> {
    const dir = join(this.root, jobId);
    // The exit is not read: the worktree may not exist, and on Windows a held file can stop git. `rmSync` then retries.
    await this.git(repoPath, ['worktree', 'remove', '--force', dir]);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    await this.must(repoPath, ['worktree', 'prune']);
  }
}
