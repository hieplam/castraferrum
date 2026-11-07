// Owner rule: a test reaches no network and names no GitHub address of a stranger. The only owner that a remote address may name is `hieplam`.
// This test scans the test, script, server and web code for `https://github.com/<owner>/<name>.git` and fails on any other owner.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const FOLDERS = ['tests', 'scripts', 'server', 'web'];
const SELF = 'tests/tools/test-addresses.test.ts';
const SKIP = new Set(['node_modules', 'dist', '.git', 'test-results']);
const ADDRESS = /https:\/\/github\.com\/([\w.-]+)\/[\w.-]+?\.git\b/g;
const OWNER = 'hieplam';

/** The owners of the GitHub remote addresses in the text, that are not the repository owner. */
export function foreignOwners(text: string): string[] {
  return [...text.matchAll(ADDRESS)].map((m) => m[1]!).filter((o) => o !== OWNER);
}

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(ts|tsx|mjs|js|json|md|css|html)$/.test(name)) out.push(path);
  }
  return out;
}

describe('test addresses', () => {
  it('control: an address of hieplam/tribe passes, and an address of another owner fails', () => {
    expect(foreignOwners('git clone https://github.com/hieplam/tribe.git')).toEqual([]);
    expect(foreignOwners('git clone https://github.com/someone-else/tribe.git')).toEqual(['someone-else']);
  });

  it('no file of tests, scripts, server or web names a GitHub remote address of another owner', () => {
    const found: string[] = [];
    for (const folder of FOLDERS) {
      for (const file of files(join(ROOT, folder))) {
        const rel = relative(ROOT, file).split(sep).join('/');
        if (rel === SELF) continue;
        for (const owner of foreignOwners(readFileSync(file, 'utf8'))) found.push(`${rel}: ${owner}`);
      }
    }
    expect(found).toEqual([]);
  });
});
