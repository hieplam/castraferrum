import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkScope, matchesGlob, parseGateConfig, parseVerifyFile, verifyEntryFiles } from '../../shared/domain/scope-guard';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');
const gate = parseGateConfig(read('goals/gate.json'));
const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

/** The JSON block of spec 2.9 that holds `goals/gate.json`. */
function specBlock(): { guarded: string[]; testGlobs: string[] } {
  const spec = read('docs/specs/2026-11-01-goal-driven-loop.md');
  const after = spec.slice(spec.indexOf('`goals/gate.json`:'));
  const block = /```json\n([\s\S]*?)\n```/.exec(after);
  if (!block) throw new Error('spec 2.9 has no gate.json block');
  return JSON.parse(block[1]!) as { guarded: string[]; testGlobs: string[] };
}

const EXTENSIONS = ['', '.mjs', '.mts', '.ts', '.js', '.json', '/index.mjs', '/index.ts', '/index.js'];
const IMPORT = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** Product code is exercised by `verify` itself, so it is not part of the bar and the guard does not cover it (spec 2.9, amendment of issue 251). */
const PRODUCT = /^(server|shared|web)\//;

/** The lifecycle scripts that `npm ci` runs, with the one text of each that has no script file. Any other text is read as a command line. */
const LIFECYCLE: Record<string, string | undefined> = {
  preinstall: undefined,
  install: undefined,
  postinstall: undefined,
  prepublish: undefined,
  preprepare: undefined,
  prepare: 'git config core.hooksPath .githooks || true',
  postprepare: undefined,
};

/** The config file that each tool of `verify` reads. `.npmrc` changes how `npm run` itself works. */
const TOOL_CONFIGS = ['vite.config.ts', 'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts', '.npmrc'];

interface Tree {
  read(path: string): string;
  isFile(path: string): boolean;
}

const diskTree: Tree = { read, isFile: (path) => existsSync(`${root}/${path}`) && !isDirectory(path) };

/** Every file that the entry files import with a relative path, followed to the end (product code excepted). Throws on an import that does not resolve. */
function importClosure(entries: string[], tree: Tree = diskTree): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = posix.normalize(queue.pop()!);
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(mjs|mts|ts|js)$/.test(file) || PRODUCT.test(file)) continue;
    for (const match of tree.read(file).matchAll(IMPORT)) {
      const target = posix.join(posix.dirname(file), match[1]!);
      const found = EXTENSIONS.map((ext) => target + ext).find((candidate) => tree.isFile(candidate));
      if (found === undefined) throw new Error(`${file} imports ${match[1]!}, which does not resolve`);
      queue.push(found);
    }
  }
  return [...seen];
}

function isDirectory(path: string): boolean {
  try {
    return readdirSync(`${root}/${path}`).length >= 0;
  } catch {
    return false;
  }
}

/** The script files that `npm ci` runs through its lifecycle scripts. Throws on a command that it does not know. */
function lifecycleFiles(scripts: Record<string, string>): string[] {
  return Object.entries(LIFECYCLE).flatMap(([name, noFile]) => {
    if (!Object.hasOwn(scripts, name) || scripts[name] === noFile) return [];
    return verifyEntryFiles(scripts, name);
  });
}

/** The entry files of the bar: what `verify` and `npm ci` run, and the config of each tool that `verify` calls. */
function barEntries(scriptMap: Record<string, string>, tree: Tree = diskTree): string[] {
  return [...verifyEntryFiles(scriptMap), ...lifecycleFiles(scriptMap), ...TOOL_CONFIGS.filter((file) => tree.isFile(file))];
}

/** The files that no entry of `guarded` matches. Test support files that a script reaches count: no exemption by `testGlobs`. */
function unguarded(files: string[]): string[] {
  return files.filter((file) => !matchesGlob(file, gate.guarded) && !PRODUCT.test(file));
}

describe('goals data files', () => {
  it('guarded of goals/gate.json equals the block of spec 2.9', () => {
    expect(gate.guarded).toEqual(specBlock().guarded);
  });

  it('testGlobs of goals/gate.json equals the block of spec 2.9', () => {
    expect(gate.testGlobs).toEqual(specBlock().testGlobs);
  });

  it('goals/gate.json and every file in goals/verify parse', () => {
    const files = readdirSync(`${root}/goals/verify`).filter((name) => name.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) expect(parseVerifyFile(read(`goals/verify/${name}`)).v).toBe(1);
    expect(gate.verify).toEqual(['npm run verify']);
  });

  it('every file that npm run verify and npm ci reach, and every file that these import, is guarded', () => {
    const entries = barEntries(scripts);
    expect(entries.length).toBeGreaterThan(5);
    expect(entries).toEqual(expect.arrayContaining(['scripts/install-webkit.mjs', 'scripts/phone-check.mts', 'vite.config.ts']));
    const closure = importClosure(entries);
    expect(closure).toEqual(expect.arrayContaining(['tests/support/server-process.ts', 'tests/support/test-repo.ts']));
    expect(unguarded(closure)).toEqual([]);
  });

  it('a PR that changes one of these files gets the verdict guarded', () => {
    for (const path of ['tests/support/server-process.ts', 'tests/support/test-repo.ts', 'tests/support/tcp-proxy.ts', 'scripts/install-webkit.mjs', 'vite.config.ts', '.npmrc']) {
      expect(checkScope({ changed: [{ status: 'M', path }], guarded: gate.guarded, verifyChanges: [] }).verdict, path).toBe('guarded');
    }
  });

  it('a task PR that adds a test support file that no script reaches passes', () => {
    expect(checkScope({ changed: [{ status: 'A', path: 'tests/support/fake-gh-kit.ts' }], guarded: gate.guarded, verifyChanges: [] }).verdict).toBe('pass');
  });

  it('a fixture: a script that imports a new tests/support file is not guarded', () => {
    const files: Record<string, string> = {
      'scripts/phone-check.mts': "import { Helper } from '../tests/support/new-helper.ts';",
      'tests/support/new-helper.ts': "import { x } from '../../server/config';",
      'server/config.ts': "import { y } from './not-followed';",
    };
    const tree: Tree = { read: (path) => files[path] ?? '', isFile: (path) => path in files };
    const closure = importClosure(['scripts/phone-check.mts'], tree);
    expect(closure).toEqual(expect.arrayContaining(['tests/support/new-helper.ts']));
    expect(unguarded(closure)).toEqual(['tests/support/new-helper.ts']);
  });

  it('a fixture: a new postinstall script file is not guarded', () => {
    const files = lifecycleFiles({ postinstall: 'node scripts/new-setup.mjs', prepare: 'git config core.hooksPath .githooks || true' });
    expect(unguarded(files)).toEqual(['scripts/new-setup.mjs']);
  });

  it('a fixture: a changed prepare script is read as a command line and throws', () => {
    expect(() => lifecycleFiles({ prepare: 'git config core.hooksPath .githooks || node scripts/evil.mjs' })).toThrow(/shell syntax|unknown command/);
  });

  it('a verify line with node scripts/evil.mjs is not guarded', () => {
    const files = verifyEntryFiles({ verify: 'npm run a && node scripts/evil.mjs', a: 'node scripts/ratchets.mjs' });
    expect(files).toEqual(['scripts/ratchets.mjs', 'scripts/evil.mjs']);
    expect(unguarded(files)).toEqual(['scripts/evil.mjs']);
  });

  it('a verify line with npx evil throws', () => {
    expect(() => verifyEntryFiles({ verify: 'npm run a && npx evil', a: 'tsc -p tsconfig.json' })).toThrow(/unknown command/);
  });
});

