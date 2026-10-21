// Folder browser (UC-29): Windows / Mac / Linux path rules. A REAL directory tree (the temp folder of the machine running the test)
// covers the node:fs part; a fake world (MemoryFolderFs) covers the rules of an operating system other than the one running — drives, `/Volumes`, Known
// Folders inside OneDrive, legacy junctions, hidden folders.
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FolderListing, FolderLookup } from '../../ports/folders';
import { windowsKnownFolders } from './known-folders';
import { MemoryFolderFs, type FolderWorld } from './memory-folder-fs';
import { NodeFolderBrowser, type FolderFs } from './node-folder-browser';

const ok = (r: FolderLookup): FolderListing => {
  if (r.kind !== 'ok') throw new Error(`expected a folder, got ${r.kind}`);
  return r;
};
const names = (r: FolderLookup) => ok(r).entries.map((e) => e.name);
const visible = (r: FolderLookup) => ok(r).entries.filter((e) => !e.hidden).map((e) => e.name);
const world = (w: FolderWorld) => new NodeFolderBrowser({ platform: w.platform, home: w.home, fs: new MemoryFolderFs(w), knownFolders: async () => w.known ?? {} });

describe('NodeFolderBrowser — real node:fs', () => {
  const tree = () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lc-browse-')));
    for (const d of ['alpha', 'beta/.git', 'z9', 'Z10', '.an', 'gamma/con']) mkdirSync(join(root, d), { recursive: true });
    writeFileSync(join(root, 'file.txt'), 'x');
    mkdirSync(join(root, 'wt'));
    writeFileSync(join(root, 'wt', '.git'), 'gitdir: ../beta/.git/worktrees/wt'); // worktree: `.git` is a file
    return root;
  };

  it('lists exactly the subfolders of the temp tree (files skipped), sorted in human order (z9 before Z10), git + hidden correct; canonical paths', async () => {
    const root = tree();
    const r = ok(await new NodeFolderBrowser().list(root));
    expect(r.path).toBe(root);
    expect(r.entries).toEqual([
      { name: '.an', path: join(root, '.an'), git: false, hidden: true },
      { name: 'alpha', path: join(root, 'alpha'), git: false, hidden: false },
      { name: 'beta', path: join(root, 'beta'), git: true, hidden: false },
      { name: 'gamma', path: join(root, 'gamma'), git: false, hidden: false },
      { name: 'wt', path: join(root, 'wt'), git: true, hidden: false },
      { name: 'z9', path: join(root, 'z9'), git: false, hidden: false },
      { name: 'Z10', path: join(root, 'Z10'), git: false, hidden: false },
    ]);
    expect([r.name, r.parent, r.git, r.truncated, r.unreadable]).toEqual([basename(root), dirname(root), false, false, null]);
    expect(r.crumbs.at(-1)).toEqual({ name: basename(root), path: root });
    expect(r.crumbs[0]!.path).toBe(root.slice(0, r.crumbs[0]!.path.length)); // the root is a prefix of the path
    expect(ok(await new NodeFolderBrowser().list(join(root, 'beta'))).git).toBe(true);
  });

  it('different typing (`..`, trailing separator) → the same canonical path; relative → notAbsolute; missing / a file → notDirectory', async () => {
    const root = tree();
    const b = new NodeFolderBrowser();
    expect(ok(await b.list(join(root, 'gamma', 'con', '..', '..') + '/')).path).toBe(root);
    expect(await b.list('relative/path')).toEqual({ kind: 'notAbsolute' });
    expect(await b.list(join(root, 'missing'))).toEqual({ kind: 'notDirectory' });
    expect(await b.list(join(root, 'file.txt'))).toEqual({ kind: 'notDirectory' });
  });

  it('empty = home folder; `~` / `~/x` open as the home folder', async () => {
    const home = tree();
    const b = new NodeFolderBrowser({ home });
    expect(ok(await b.list(null)).path).toBe(home);
    expect(ok(await b.list('  ')).path).toBe(home);
    expect(ok(await b.list('~')).path).toBe(home);
    expect(ok(await b.list('~/gamma')).path).toBe(join(home, 'gamma'));
  });

  it('folder cap: returns only the first part by name + truncated', async () => {
    const r = ok(await new NodeFolderBrowser({ maxEntries: 2 }).list(tree()));
    expect([r.entries.map((e) => e.name), r.truncated]).toEqual([['.an', 'alpha'], true]);
  });

  it.runIf(process.platform === 'win32')('real Windows: drives include C:, Known Folders are real folders (Desktop may be inside OneDrive)', async () => {
    const p = await new NodeFolderBrowser().places();
    expect(p.platform).toBe('win32');
    expect(p.roots).toContainEqual({ name: 'C:', path: 'C:\\' });
    const known = await windowsKnownFolders();
    expect(known.desktop).toBeTruthy();
    expect(p.places.find((x) => x.kind === 'desktop')?.path).toBe(known.desktop);
    expect(ok(await new NodeFolderBrowser().list('C:')).path).toBe('C:\\'); // "C:" = the drive root
  }, 20_000);
});

describe('NodeFolderBrowser — Windows (fake world)', () => {
  const W: FolderWorld = {
    platform: 'win32',
    home: 'C:\\Users\\alice',
    known: { desktop: 'C:\\Users\\alice\\OneDrive\\Рабочий стол', documents: 'C:\\Users\\alice\\OneDrive\\Documents' },
    dirs: [
      'C:\\$Recycle.Bin', 'C:\\System Volume Information', 'C:\\ProgramData', 'C:\\Program Files', 'C:\\Windows',
      'C:\\Users\\alice\\AppData\\Roaming', 'C:\\Users\\alice\\Downloads\\repo\\Atlas\\.git', 'C:\\Users\\alice\\Downloads\\repo\\scratch',
      'C:\\Users\\alice\\Templates', 'C:\\Users\\alice\\.claude', 'D:\\backup\\Atlas', 'C:\\Users\\alice\\Bi mat',
    ],
    denied: ['C:\\Users\\alice\\Bi mat'],
    links: { 'C:\\Users\\alice\\Application Data': 'C:\\Users\\alice\\AppData\\Roaming', 'C:\\Documents and Settings': 'C:\\Users' },
  };

  it('drive root: system folders hidden like Explorer; "C:" and different case / "/" typing → canonical form', async () => {
    const b = world(W);
    expect(visible(await b.list('C:\\'))).toEqual(['Program Files', 'Users', 'Windows']);
    expect(names(await b.list('C:'))).toEqual(['$Recycle.Bin', 'Documents and Settings', 'Program Files', 'ProgramData', 'System Volume Information', 'Users', 'Windows']);
    const r = ok(await b.list('c:/users/alice/downloads/REPO'));
    expect([r.path, r.parent, r.name]).toEqual(['C:\\Users\\alice\\Downloads\\repo', 'C:\\Users\\alice\\Downloads', 'repo']);
    expect(r.crumbs).toEqual([
      { name: 'C:', path: 'C:\\' },
      { name: 'Users', path: 'C:\\Users' },
      { name: 'alice', path: 'C:\\Users\\alice' },
      { name: 'Downloads', path: 'C:\\Users\\alice\\Downloads' },
      { name: 'repo', path: 'C:\\Users\\alice\\Downloads\\repo' },
    ]);
    expect(r.entries).toEqual([
      { name: 'Atlas', path: 'C:\\Users\\alice\\Downloads\\repo\\Atlas', git: true, hidden: false },
      { name: 'scratch', path: 'C:\\Users\\alice\\Downloads\\repo\\scratch', git: false, hidden: false },
    ]);
    expect(ok(await b.list('C:\\')).parent).toBeNull();
  });

  it('home folder: AppData + legacy junction (Application Data) hidden, a real folder named "Templates" not hidden; `~\\x` opens', async () => {
    const b = world(W);
    const r = ok(await b.list(null));
    expect(r.entries.map((e) => [e.name, e.hidden])).toEqual([
      ['.claude', true], ['AppData', true], ['Application Data', true], ['Bi mat', false], ['Downloads', false], ['OneDrive', false], ['Templates', false],
    ]);
    expect(ok(await b.list('~\\Downloads')).path).toBe('C:\\Users\\alice\\Downloads');
  });

  it('no permission → the folder exists but unreadable: denied, breadcrumb / parent folder still present', async () => {
    const r = ok(await world(W).list('C:\\Users\\alice\\Bi mat'));
    expect([r.entries, r.unreadable, r.parent]).toEqual([[], 'denied', 'C:\\Users\\alice']);
  });

  it('quick access: Desktop / Documents are the exact Known Folders (OneDrive, localized name), Downloads dropped when absent; drives C: D:', async () => {
    const p = await world(W).places();
    expect(p).toEqual({
      platform: 'win32',
      home: 'C:\\Users\\alice',
      places: [
        { kind: 'home', path: 'C:\\Users\\alice' },
        { kind: 'desktop', path: 'C:\\Users\\alice\\OneDrive\\Рабочий стол' },
        { kind: 'documents', path: 'C:\\Users\\alice\\OneDrive\\Documents' },
        { kind: 'downloads', path: 'C:\\Users\\alice\\Downloads' },
      ],
      roots: [{ name: 'C:', path: 'C:\\' }, { name: 'D:', path: 'D:\\' }],
    });
  });

  it('parentOf / nameOf / same follow Windows rules (case-insensitive)', () => {
    const b = world(W);
    expect([b.parentOf('C:\\Users\\alice'), b.parentOf('C:\\'), b.nameOf('C:\\'), b.nameOf('D:\\backup\\Atlas')]).toEqual(['C:\\Users', null, 'C:', 'Atlas']);
    expect([b.same('C:\\Users\\alice', 'c:\\users\\alice'), b.same('C:\\a', 'C:\\b')]).toEqual([true, false]);
  });
});

describe('NodeFolderBrowser — Mac (fake world)', () => {
  const M: FolderWorld = {
    platform: 'darwin',
    home: '/Users/alice',
    dirs: [
      '/Applications', '/Library', '/System', '/Users/Shared', '/bin', '/private/tmp', '/usr/local', '/opt/homebrew',
      '/Users/alice/Desktop', '/Users/alice/Documents', '/Users/alice/Downloads', '/Users/alice/Library/Caches', '/Users/alice/Code/atlas/.git',
      '/Users/alice/Code/dotfiles/.git', '/Users/alice/Code/notes', '/Users/alice/.ssh', '/Volumes/Backup/repos',
    ],
    links: { '/Volumes/Macintosh HD': '/' },
  };

  it('root "/": Unix folders hidden like Finder; ~/Library hidden; ~/Code lists git; `~/x` opens', async () => {
    const b = world(M);
    expect(visible(await b.list('/'))).toEqual(['Applications', 'Library', 'System', 'Users']);
    expect(ok(await b.list('/')).crumbs).toEqual([{ name: '/', path: '/' }]);
    expect(visible(await b.list('~'))).toEqual(['Code', 'Desktop', 'Documents', 'Downloads']);
    expect(ok(await b.list('/Users/alice')).entries.filter((e) => e.hidden).map((e) => e.name)).toEqual(['.ssh', 'Library']);
    const code = ok(await b.list('~/Code'));
    expect([code.path, code.parent]).toEqual(['/Users/alice/Code', '/Users/alice']);
    expect(code.entries.map((e) => [e.name, e.git])).toEqual([['atlas', true], ['dotfiles', true], ['notes', false]]);
    expect(code.crumbs.map((c) => c.name)).toEqual(['/', 'Users', 'alice', 'Code']);
    expect(ok(await b.list('/users/alice/code')).path).toBe('/Users/alice/Code'); // APFS is case-insensitive by default
  });

  it('drives: the boot drive carries its real name ("Macintosh HD" → /) + external drives in /Volumes; quick access ~/Desktop, ~/Documents, ~/Downloads', async () => {
    const p = await world(M).places();
    expect(p.roots).toEqual([{ name: 'Macintosh HD', path: '/' }, { name: 'Backup', path: '/Volumes/Backup' }]);
    expect(p.places.map((x) => `${x.kind}=${x.path}`)).toEqual([
      'home=/Users/alice', 'desktop=/Users/alice/Desktop', 'documents=/Users/alice/Documents', 'downloads=/Users/alice/Downloads',
    ]);
    expect(p.platform).toBe('darwin');
  });

  it('macOS blocks access (TCC — Desktop / Documents not granted to Terminal) → unreadable: denied', async () => {
    const r = ok(await world({ ...M, denied: ['/Users/alice/Desktop'] }).list('~/Desktop'));
    expect([r.unreadable, r.entries]).toEqual(['denied', []]);
  });
});

describe('NodeFolderBrowser — Linux (fake world)', () => {
  it('single root "/", case-sensitive', async () => {
    const b = world({ platform: 'linux', home: '/home/alice', dirs: ['/home/alice/code/Atlas', '/home/alice/code/atlas'] });
    expect((await b.places()).roots).toEqual([{ name: '/', path: '/' }]);
    expect(names(await b.list('/home/alice/code'))).toEqual(['Atlas', 'atlas']); // two different folders; name tie → by character code
    expect([b.same('/a', '/A'), await b.list('/HOME/alice')]).toEqual([false, { kind: 'notDirectory' }]);
  });
});

describe('NodeFolderBrowser — drive that does not answer', () => {
  it('a listing that hangs past listTimeoutMs → unreadable: timeout (the request does not hang)', async () => {
    const hang: FolderFs = {
      realpath: async (p) => p,
      stat: async () => ({ isDirectory: () => true }),
      readdir: () => new Promise(() => {}),
    };
    const r = ok(await new NodeFolderBrowser({ platform: 'win32', home: 'Z:\\', fs: hang, listTimeoutMs: 50 }).list('Z:\\share'));
    expect([r.unreadable, r.entries]).toEqual(['timeout', []]);
  });
});
