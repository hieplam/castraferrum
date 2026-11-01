import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { ReviewCluster, ReviewReports } from '../../ports/review-reports';

/** Spec 2.12: only the keys that the scoreboard reads are checked; `check` is read apart, so a bad check never rejects a cluster. */
const reportFile = z.object({
  v: z.literal(1),
  clusters: z.array(
    z.object({
      cause: z.string(),
      runIds: z.array(z.string()),
      fingerprint: z.string().min(1),
      check: z.unknown().optional(),
    }),
  ),
});

/** The check name of a cluster, or `null` when there is no check or its name is empty. */
function checkName(check: unknown): string | null {
  if (typeof check !== 'object' || check === null) return null;
  const name = (check as { name?: unknown }).name;
  return typeof name === 'string' && name.trim() !== '' ? name : null;
}

/** Reads `<repoPath>/reports/process-review/*.json` from the disk. */
export class FsReviewReports implements ReviewReports {
  async read(repoPaths: string[]): Promise<ReviewCluster[]> {
    const out: ReviewCluster[] = [];
    for (const repoPath of repoPaths) {
      const dir = join(repoPath, 'reports', 'process-review');
      let names: string[];
      try {
        names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
      } catch {
        continue;
      }
      for (const name of names) {
        let parsed;
        try {
          parsed = reportFile.safeParse(JSON.parse(await readFile(join(dir, name), 'utf8')));
        } catch {
          continue;
        }
        if (!parsed.success) continue;
        for (const c of parsed.data.clusters) {
          out.push({ repoPath, fingerprint: c.fingerprint, cause: c.cause, runIds: c.runIds, checkName: checkName(c.check) });
        }
      }
    }
    return out;
  }
}
