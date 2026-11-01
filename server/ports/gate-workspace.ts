import type { ChangedFile } from '../../shared/domain/scope-guard';
import type { CommandResult } from './command-runner';

/** A worktree of one gate job: the PR rebased on `baseSha`. */
export type GateTree = {
  dir: string;
  /** The commit of `main` at the fetch. */
  baseSha: string;
  /** The PR on top of `baseSha`. */
  rebasedSha: string;
};

export type PrepareResult = { ok: true; tree: GateTree } | { ok: false; output: string };

/** A git call of the gate that did not succeed. `exitCode` is `null` when git did not start or timed out. */
export class GateWorkspaceError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'GateWorkspaceError';
  }
}

/** The git work of the gate. A run never writes its own exam: `readAt` and `listAt` read git objects, not files. */
export interface GateWorkspace {
  /** Updates `origin/main` and `refs/gate/head`. `headMatches` is false when the branch moved away from `headSha`. */
  fetch(repoPath: string, head: { headRef: string; headSha: string }): Promise<{ mainSha: string; headMatches: boolean }>;
  /** The text of a file in the commit, or `null` when the commit holds no such file. */
  readAt(repoPath: string, sha: string, path: string): Promise<string | null>;
  /** The names of the `.json` files directly in `dir` of the commit, sorted. */
  listAt(repoPath: string, sha: string, dir: string): Promise<string[]>;
  /** What the PR changed since its merge base with `main`. A rename is a delete plus an add. */
  changed(repoPath: string, mainSha: string, headSha: string): Promise<{ mergeBase: string; files: ChangedFile[] }>;
  /** Makes a clean worktree of the PR rebased on `mainSha`. On a failure no folder stays, and `output` says why. */
  prepare(repoPath: string, jobId: string, mainSha: string, headSha: string): Promise<PrepareResult>;
  /** Puts every changed file that is not a test back to `baseSha`, and returns those paths. */
  stubRestore(tree: GateTree, files: ChangedFile[], testGlobs: string[]): Promise<string[]>;
  /** Gives the tree back at `rebasedSha`. Ignored files stay. */
  stubUndo(tree: GateTree): Promise<void>;
  run(tree: GateTree, command: { line: string; env: Record<string, string>; timeoutMs: number; signal?: AbortSignal }): Promise<CommandResult>;
  /** Removes the worktree of the job. Safe to call when it does not exist. */
  remove(repoPath: string, jobId: string): Promise<void>;
}
