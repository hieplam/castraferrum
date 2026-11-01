import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { matchesGlob, parseGateConfig, parseVerifyFile, verifyEntryFiles } from '../../shared/domain/scope-guard';

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

/** Every file that the entry files import with a relative path, followed to the end. Throws on an import that does not resolve. */
function importClosure(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = posix.normalize(queue.pop()!);
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(mjs|mts|ts|js)$/.test(file)) continue;
    // A test file is covered by the stub check, so the closure stops there (a follow-up issue covers tests/support).
    if (matchesGlob(file, gate.testGlobs) && !matchesGlob(file, gate.guarded)) continue;
    for (const match of read(file).matchAll(IMPORT)) {
      const target = posix.join(posix.dirname(file), match[1]!);
      const found = EXTENSIONS.map((ext) => target + ext).find((candidate) => existsSync(`${root}/${candidate}`) && !isDirectory(candidate));
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

/** The files that no entry of `guarded` matches. A file in `testGlobs` is a test: the stub check covers it, not the guard. */
function unguarded(files: string[]): string[] {
  return files.filter((file) => !matchesGlob(file, gate.guarded) && !matchesGlob(file, gate.testGlobs));
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

  it('every script file that npm run verify reaches, and every file that these import, is guarded', () => {
    const entries = verifyEntryFiles(scripts);
    expect(entries.length).toBeGreaterThan(5);
    expect(unguarded(importClosure(entries))).toEqual([]);
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

