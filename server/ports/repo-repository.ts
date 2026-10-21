// A repo registered for loops (SPEC-phase-2 § Model): each loop runs in exactly one repo (the run's `cwd`).
// The console does not know what a repo is (git or not) — it is just a named folder.

export type RepoRecord = {
  id: string;
  /** 1–80 characters, unique (case-insensitive). */
  name: string;
  /** Canonical absolute path (DirectoryProbe), unique. */
  path: string;
  createdAt: Date;
};

export type NewRepoRecord = RepoRecord;

export interface RepoRepository {
  /**
   * Throws `REPO_NAME_TAKEN` (duplicate name, case-insensitive) / `REPO_PATH_TAKEN` (duplicate path — `details.name` =
   * the name of the repo that already registered that path; the UI names it: D-UI21).
   */
  insert(repo: NewRepoRecord): Promise<RepoRecord>;
  findById(id: string): Promise<RepoRecord | null>;
  /** By name (case-insensitive), then id. */
  list(): Promise<RepoRecord[]>;
  /** Number of loops (including archived ones) using each repo — the "Loops using it" column of the Repo page (D-UI11). A repo with no loops is absent from the Map. */
  loopCounts(): Promise<Map<string, number>>;
  /**
   * Deletes a repo that no loop (including archived loops) uses any more. Throws `REPO_NOT_FOUND`; if loops still use it → `REPO_IN_USE` with
   * `details.loops` = those loops' names (oldest first), `details.archivedLoops` = the names among them that are archived (the UI
   * writes "(archived)" — D-UI20). The DB enforces this with the foreign key `loops.repo_id`, not a check in code.
   */
  delete(id: string): Promise<void>;
}
