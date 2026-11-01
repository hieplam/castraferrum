import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FsReviewReports } from './fs-review-reports';

const folders: string[] = [];
afterEach(() => {
  for (const f of folders.splice(0)) rmSync(f, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'lc-review-reports-'));
  folders.push(dir);
  mkdirSync(join(dir, 'reports', 'process-review'), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'reports', 'process-review', name), text);
  return dir;
}

const cluster = (fingerprint: string, over: Record<string, unknown> = {}) => ({
  id: fingerprint,
  cause: `cause ${fingerprint}`,
  events: 2,
  runIds: ['r1', 'r2'],
  firstAt: '2026-10-01T00:00:00Z',
  lastAt: '2026-10-02T00:00:00Z',
  repo: 'o/r',
  fingerprint,
  ...over,
});
const report = (...clusters: unknown[]) => JSON.stringify({ v: 1, from: '2026-10-01', to: '2026-10-18', clusters });

describe('FsReviewReports', () => {
  it('reads the clusters of two files, oldest file first, and gives a cluster with no check or an empty check name no check', async () => {
    const dir = repo({
      '2026-10-18.json': report(cluster('bbb', { check: { kind: 'test', name: 'tests/b.test.ts', replay: 'x' } })),
      '2026-10-04.json': report(cluster('aaa'), cluster('ccc', { check: { kind: 'test', name: '', replay: 'x' } })),
    });
    const clusters = await new FsReviewReports().read([dir]);
    expect(clusters.map((c) => [c.fingerprint, c.checkName, c.repoPath])).toEqual([
      ['aaa', null, dir],
      ['ccc', null, dir],
      ['bbb', 'tests/b.test.ts', dir],
    ]);
    expect(clusters[0]!.runIds).toEqual(['r1', 'r2']);
  });

  it('ignores a file that is not JSON and a file that is not spec 2.12', async () => {
    const dir = repo({
      '2026-10-01.json': '{ not json',
      '2026-10-02.json': JSON.stringify({ v: 2, clusters: [cluster('v2')] }),
      '2026-10-03.json': JSON.stringify({ v: 1, clusters: [{ cause: 'no fingerprint', runIds: [] }] }),
      '2026-10-04.txt': report(cluster('txt')),
      '2026-10-05.json': report(cluster('good')),
    });
    expect((await new FsReviewReports().read([dir])).map((c) => c.fingerprint)).toEqual(['good']);
  });

  it('gives no clusters for a folder with no report folder, and for a folder that does not exist', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'lc-review-reports-'));
    folders.push(empty);
    expect(await new FsReviewReports().read([empty, join(empty, 'missing')])).toEqual([]);
  });
});
