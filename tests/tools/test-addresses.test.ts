// Owner rule: a test reaches no network and names no GitHub address of a stranger. The only owner that a remote address may name is `hieplam`.
// This test scans the test, script, server, web and shared code and the design preview data. It fails on any owner other than `hieplam` in these forms:
// a `github.com/<owner>/<name>` address with any ending, `-R <owner>/<name>` (text and argv forms), and a repository field or constant such as `githubRepo: 'o/r'`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const FOLDERS = ['tests', 'scripts', 'server', 'web', 'shared', 'design/ds/preview'];
const SELF = 'tests/tools/test-addresses.test.ts';
const SKIP = new Set(['node_modules', 'dist', '.git', 'test-results']);
const NAME = String.raw`([\w.-]+)\\?\/[\w.-]+`;
const FORMS = [
  new RegExp(String.raw`\brepos\\?\/` + NAME, 'gi'),
  new RegExp(String.raw`(?<!api\.)github\.com[/:]` + NAME, 'gi'),
  new RegExp(String.raw`(?:^|[\s'"\x60,])(?:-R|--repo)['"\x60]?(?:\s+|\s*,\s*)['"\x60]?` + NAME, 'gi'),
  new RegExp(String.raw`\b\w*(?:githubRepo|[rR]epo|REPO|[rR]epository|nameWithOwner)\w*['"\x60]?\s*[:=]\s*['"\x60]` + NAME + String.raw`['"\x60]`, 'gi'),
];
const OWNER = 'hieplam';

/** The owners of the GitHub remote addresses in the text, that are not the repository owner. */
export function foreignOwners(text: string): string[] {
  return FORMS.flatMap((form) => [...text.matchAll(form)].map((m) => m[1]!)).filter((o) => o.toLowerCase() !== OWNER);
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

  it('finds an address with any ending', () => {
    expect(foreignOwners("const u = 'https://github.com/fake/repo'")).toEqual(['fake']);
    expect(foreignOwners('see github.com/o/r/pull/3')).toEqual(['o']);
    expect(foreignOwners('git@github.com:acme/api.git')).toEqual(['acme']);
    expect(foreignOwners('https://github.com/hieplam/tribe/issues/1')).toEqual([]);
  });

  it('finds -R in text and argv forms', () => {
    expect(foreignOwners("'gh -R o/r pr merge 1'")).toEqual(['o']);
    expect(foreignOwners("run(['issue', 'view', '1', '-R', 'fake/repo'])")).toEqual(['fake']);
    expect(foreignOwners('run(["-R", "acme/api"])')).toEqual(['acme']);
    expect(foreignOwners("--repo acme/api")).toEqual(['acme']);
    expect(foreignOwners("'-R', 'hieplam/tribe'")).toEqual([]);
    expect(foreignOwners("'-R', REPO")).toEqual([]);
  });

  it('finds a repository field or constant', () => {
    expect(foreignOwners("{ githubRepo: 'acme/api' }")).toEqual(['acme']);
    expect(foreignOwners("{ repo: 'o/r' }")).toEqual(['o']);
    expect(foreignOwners('{ "repo": "fake/repo" }')).toEqual(['fake']);
    expect(foreignOwners(String.raw`path.match(/^repos\/fake\/repo\/issues$/)`)).toEqual(['fake']);
    expect(foreignOwners("const GITHUB_REPO = 'x/y';")).toEqual(['x']);
    expect(foreignOwners("{ githubRepo: 'hieplam/tribe', repo: 'hieplam/castraferrum' }")).toEqual([]);
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
