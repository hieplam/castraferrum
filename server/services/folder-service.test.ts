// FolderService (UC-29): the "Browse…" box of the Repo page — marks folders registered as repos, errors on the `path` field, the
// "Next to registered repos" group. Memory repository + the real browser (NodeFolderBrowser) over a fake folder world.
import { describe, expect, it } from 'vitest';
import { MemoryFolderFs, type FolderWorld } from '../adapters/fs/memory-folder-fs';
import { NodeFolderBrowser } from '../adapters/fs/node-folder-browser';
import { createMemoryRepositories } from '../adapters/memory';
import { DefaultFolderService } from './folder-service';

const W: FolderWorld = {
  platform: 'win32',
  home: 'C:\\Users\\alice',
  known: { documents: 'C:\\Users\\alice\\OneDrive\\Documents' },
  dirs: [
    'C:\\Users\\alice\\Downloads\\repo\\Atlas\\.git', 'C:\\Users\\alice\\Downloads\\repo\\atlas-tools\\.git', 'C:\\Users\\alice\\Downloads\\repo\\scratch',
    'C:\\Users\\alice\\dotfiles\\.git', 'D:\\backup\\Atlas', 'D:\\backup\\old', 'E:\\a\\b\\c\\d\\e\\f\\g',
  ],
};

async function kit(repos: [name: string, path: string][]) {
  const r = createMemoryRepositories();
  for (const [i, [name, path]] of repos.entries()) await r.repos.insert({ id: `r${i}`, name, path, createdAt: new Date(0) });
  const folders = new NodeFolderBrowser({ platform: W.platform, home: W.home, fs: new MemoryFolderFs(W), knownFolders: async () => W.known ?? {} });
  return new DefaultFolderService({ repos: r.repos, folders });
}

async function issueOf(p: Promise<unknown>): Promise<string> {
  const err = (await p.then(() => null, (e: unknown) => e)) as { code: string; details: { issues: { field: string; code: string }[] } } | null;
  expect(err?.code).toBe('VALIDATION_FAILED');
  return err!.details.issues.map((i) => `${i.field}:${i.code}`).join(' ');
}

describe('FolderService', () => {
  it('UC-29 folder + subfolders; a folder registered as a repo (even with different letter case) carries the repo name', async () => {
    const s = await kit([['Atlas', 'C:\\Users\\alice\\Downloads\\repo\\Atlas'], ['root repo', 'c:\\users\\alice\\downloads\\REPO']]);
    const v = await s.browse('C:\\Users\\alice\\Downloads\\repo');
    expect([v.path, v.repo, v.git]).toEqual(['C:\\Users\\alice\\Downloads\\repo', 'root repo', false]);
    expect(v.entries.map((e) => [e.name, e.git, e.repo])).toEqual([['Atlas', true, 'Atlas'], ['atlas-tools', true, null], ['scratch', false, null]]);
    expect('kind' in v).toBe(false);
  });

  it('UC-29 empty → home folder; relative → path:invalid; missing → path:notDirectory', async () => {
    const s = await kit([]);
    expect((await s.browse()).path).toBe('C:\\Users\\alice');
    expect((await s.browse('   ')).path).toBe('C:\\Users\\alice');
    expect(await issueOf(s.browse('relative\\path'))).toBe('path:invalid');
    expect(await issueOf(s.browse('C:\\does-not-exist'))).toBe('path:notDirectory');
  });

  it('quick access: the "next to repos" group = the parent folders of repos (folders already in places are left out), most repos first, at most 6', async () => {
    const s = await kit([
      ['Atlas', 'C:\\Users\\alice\\Downloads\\repo\\Atlas'],
      ['tools', 'C:\\Users\\alice\\Downloads\\repo\\atlas-tools'],
      ['dotfiles', 'C:\\Users\\alice\\dotfiles'], // parent = home folder → already in places
      ['old copy', 'D:\\backup\\Atlas'],
      ...[0, 1, 2, 3, 4, 5].map((i): [string, string] => [`solo ${i}`, `E:\\p${i}\\repo`]), // 6 different parent folders, one repo each
    ]);
    const p = await s.places();
    expect(p.places.map((x) => x.kind)).toEqual(['home', 'documents', 'downloads']);
    expect(p.nearRepos[0]).toEqual({ path: 'C:\\Users\\alice\\Downloads\\repo', name: 'repo', repos: ['Atlas', 'tools'] });
    expect(p.nearRepos[1]).toEqual({ path: 'D:\\backup', name: 'backup', repos: ['old copy'] });
    expect(p.nearRepos).toHaveLength(6);
    expect(p.nearRepos.some((n) => n.path === 'C:\\Users\\alice')).toBe(false);
    expect(p.roots.map((r) => r.name)).toEqual(['C:', 'D:', 'E:']);
  });
});
