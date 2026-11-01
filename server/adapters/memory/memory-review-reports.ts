import type { ReviewCluster, ReviewReports } from '../../ports/review-reports';

/** In-RAM `ReviewReports`: a test sets the clusters of a folder. */
export class MemoryReviewReports implements ReviewReports {
  readonly #byPath = new Map<string, ReviewCluster[]>();

  set(repoPath: string, clusters: ReviewCluster[]): void {
    this.#byPath.set(repoPath, clusters);
  }

  async read(repoPaths: string[]): Promise<ReviewCluster[]> {
    return repoPaths.flatMap((p) => (this.#byPath.get(p) ?? []).map((c) => ({ ...c, runIds: [...c.runIds] })));
  }
}
