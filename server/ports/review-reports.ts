// The reports of the process review (spec 2.12): `<repo folder>/reports/process-review/<date>.json`, read-only.

/** One cluster of a report. `checkName` is `null` when the cluster has no check or its check has an empty name. */
export type ReviewCluster = {
  /** The folder of the repository whose report holds the cluster. */
  repoPath: string;
  fingerprint: string;
  cause: string;
  /** Run ids, `gate:<job id>` ids and `comment:` ids, as the report wrote them. */
  runIds: string[];
  checkName: string | null;
};

export interface ReviewReports {
  /**
   * The clusters of every report of every folder, oldest file first (by file name). A file that is not JSON, or not spec 2.12, is ignored,
   * and so is a folder with no report folder. Never rejects.
   */
  read(repoPaths: string[]): Promise<ReviewCluster[]>;
}
