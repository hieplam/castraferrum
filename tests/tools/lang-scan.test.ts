import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  NEUTRAL_USERS,
  SKIP_PATHS,
  WORD_HASHES,
  countCommentLines,
  findCoupling,
  findVietnamese,
  loadLocalPatterns,
  run,
  tokenHash,
} from '../../scripts/lang-scan.mjs';

// This file holds no Vietnamese text. Samples are built at run time from numeric character codes:
// tokens whose SHA-256 is in the hashed list, and letters outside ASCII from code points.
const word = (...codes: number[]) => String.fromCharCode(...codes);
const TOKEN_A = word(107, 104, 111, 110, 103); // in the hashed list
const TOKEN_B = word(108, 117, 111, 116); // in the hashed list
const TOKEN_C = word(110, 103, 117, 111, 105); // in the hashed list
const DIACRITIC_LETTER = String.fromCodePoint(0x1ea1); // Latin Extended Additional
const LATIN1_LETTER = String.fromCodePoint(0xe0);
const D_STROKE = String.fromCodePoint(0x111);
const HORN_LETTER = String.fromCodePoint(0x1a1);
const COMBINING_DOT = String.fromCodePoint(0x323);

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, '..', '..', 'scripts');
const scratch: string[] = [];

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lang-scan-'));
  scratch.push(d);
  return d;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(root: string, rel: string, content: string | Buffer): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

/** A scratch git repo with the given files committed. */
function repo(files: Record<string, string | Buffer>): string {
  const root = tmp();
  git(root, 'init', '-q');
  for (const [rel, content] of Object.entries(files)) write(root, rel, content);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'initial');
  return root;
}

function value(out: { lines: string[] }, name: string): number {
  const line = out.lines.find((l) => l.startsWith(`${name}: `));
  if (!line) throw new Error(`no "${name}" line in output`);
  return Number(line.slice(name.length + 2));
}

afterAll(() => {
  for (const d of scratch) fs.rmSync(d, { recursive: true, force: true });
});

describe('detection classes', () => {
  it('flags a letter with diacritics (every sampled block)', () => {
    for (const letter of [DIACRITIC_LETTER, LATIN1_LETTER, D_STROKE, HORN_LETTER]) {
      expect(findVietnamese(`plain text ${letter} more`)?.kind).toBe('diacritic');
    }
  });

  it('flags a base letter followed by a combining mark (decomposed form)', () => {
    expect(findVietnamese(`a${COMBINING_DOT} b`)?.kind).toBe('diacritic');
  });

  it('flags an unaccented token from the hashed list, in code, identifiers and prose', () => {
    expect(findVietnamese(`// ${TOKEN_A} the rest`)?.kind).toBe('word');
    expect(findVietnamese(`rule-${TOKEN_A}-call`)?.kind).toBe('word');
    expect(findVietnamese(`const ${TOKEN_B}Run = 1;`)?.kind).toBe('word');
    expect(findVietnamese(`snake_${TOKEN_C}_case`)?.kind).toBe('word');
    expect(findVietnamese(TOKEN_A.toUpperCase())?.kind).toBe('word');
  });

  it('the hashed list matches the token hash function, and has no plain text in it', () => {
    expect(WORD_HASHES).toContain(tokenHash(TOKEN_A));
    expect(WORD_HASHES).toContain(tokenHash(TOKEN_A.toUpperCase()));
    expect(WORD_HASHES.length).toBeGreaterThan(200);
    for (const h of WORD_HASHES) expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(WORD_HASHES).size).toBe(WORD_HASHES.length);
  });

  it('no hashed token is a word of the English corpus (docs, README, CONTRIBUTING, en.ts)', () => {
    const root = path.resolve(here, '..', '..');
    const files: string[] = ['README.md', 'CONTRIBUTING.md', path.join('shared', 'i18n', 'en.ts')];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.join(dir, e.name);
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith('.md')) files.push(rel);
      }
    };
    walk('docs');
    const known = new Set(WORD_HASHES);
    const hits = new Set<string>();
    for (const f of files) {
      const raw = fs.readFileSync(path.join(root, f), 'utf8');
      // English prose only: markdown without code, the locale file reduced to its string literals
      // (identifiers and comments are code, not prose; the scanner covers them separately).
      const text = f.endsWith('.md')
        ? raw.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
        : (raw.match(/'(?:[^'\\\n]|\\.)*'/g) ?? []).join('\n');
      for (const tok of text.split(/[^\p{L}]+|(?<=\p{Ll})(?=\p{Lu})/u)) {
        if (tok.length >= 2 && known.has(tokenHash(tok))) hits.add(`${tok.toLowerCase()} (${f})`);
      }
    }
    expect([...hits]).toEqual([]);
  });

  it('does not flag an English sentence that shares letters with the list', () => {
    const english = [
      'Take that, then ten long mats, than none of the thin men sat on a mat.',
      'The quick brown fox jumps over the lazy dog; a button, a nut and a bolt.',
      'export function parse(input: string): Result { return input.length > 0 ? ok(input) : fail(); }',
      `Run #{n} finished in {s} seconds`,
    ];
    for (const s of english) expect(findVietnamese(s)).toBeNull();
  });

  it('ignores long hash-like chunks (lock files, data URIs)', () => {
    const chunk = `sha512-${TOKEN_A}${'Ab3'.repeat(20)}${TOKEN_B}`;
    expect(findVietnamese(`"integrity": "${chunk}"`)).toBeNull();
  });
});

describe('skip list', () => {
  it('has exactly one entry, the locale file path', () => {
    expect(SKIP_PATHS).toEqual(['shared/i18n/vi.ts']);
    expect(SKIP_PATHS).toHaveLength(1);
  });

  it('skips shared/i18n/vi.ts but scans the same file name under tests/arch-fixtures', () => {
    const root = repo({
      'shared/i18n/vi.ts': `export const x = '${TOKEN_A}';\n`,
      'tests/arch-fixtures/shared/i18n/vi.ts': `export const x = '${TOKEN_A}';\n`,
    });
    const out = run(['--tree', '--list'], { root });
    expect(value(out, 'vietnamese')).toBe(1);
    const hits = out.lines.filter((l) => l.includes('[text/word]'));
    expect(hits).toHaveLength(1);
    expect(hits[0]?.startsWith('tests/arch-fixtures/shared/i18n/vi.ts:1')).toBe(true);
  });
});

describe('path names', () => {
  it('flags a Vietnamese file name and folder name, and counts the folder', () => {
    const root = repo({
      [`web/${TOKEN_B}-panel.ts`]: 'export const a = 1;\n',
      [`${TOKEN_A}/index.ts`]: 'export const b = 2;\n',
      'server/ok.ts': 'export const c = 3;\n',
    });
    const out = run(['--tree', '--list'], { root });
    expect(value(out, 'vietnamese')).toBe(2);
    expect(out.lines.some((l) => l.includes('web:') && l.includes('vietnamese 1'))).toBe(true);
    expect(out.lines.some((l) => l.includes('[name/word]'))).toBe(true);
  });

  it('--names scans names only; content is ignored', () => {
    const root = repo({
      'server/ok.ts': `// ${TOKEN_A}\n`,
      [`server/${TOKEN_B}.ts`]: 'export const a = 1;\n',
    });
    const out = run(['--names'], { root });
    expect(value(out, 'vietnamese')).toBe(1);
    expect(value(out, 'comment-lines')).toBe(0);
  });

  it('a binary file is skipped for content but its name is scanned', () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]), Buffer.from(TOKEN_A)]);
    const named = repo({ [`shots/${TOKEN_A}.png`]: png });
    expect(value(run([], { root: named }), 'vietnamese')).toBe(1);
    const plain = repo({ 'shots/ok.png': png, 'shots/data.bin': Buffer.from([0, 1, 2, ...Buffer.from(TOKEN_A)]) });
    expect(value(run([], { root: plain }), 'vietnamese')).toBe(0);
  });
});

describe('coupling', () => {
  const slash = '/';
  it('encoded project folder: neutral users pass, any other user is flagged', () => {
    const enc = (drive: string, user: string) => `${drive}--Users` + `-${user}-x`; // built so this file does not match itself
    expect(findCoupling(`projects/${enc('C', 'alice')}`)).toBeNull();
    expect(findCoupling(`projects/${enc('C', 'carol')}`)?.kind).toBe('home-path');
    expect(findCoupling(enc('D', 'dave'))?.kind).toBe('home-path');
    expect(findCoupling(`see AB${enc('C', 'dave')}`)).toBeNull();
  });

  it('home paths: neutral users pass, any other user is flagged', () => {
    expect(NEUTRAL_USERS).toEqual(['alice', 'bob', 'user', 'runner', 'Shared', 'Public', 'Default']);
    expect(findCoupling(`const p = '${slash}Users${slash}alice${slash}x';`)).toBeNull();
    expect(findCoupling(`const p = '${slash}Users${slash}Shared';`)).toBeNull();
    expect(findCoupling(`cwd: ${slash}home${slash}runner${slash}work`)).toBeNull();
    expect(findCoupling(`C:\\Users\\bob\\x`)).toBeNull();
    expect(findCoupling(`const p = '${slash}Users${slash}carol${slash}x';`)?.kind).toBe('home-path');
    expect(findCoupling(`const p = '${slash}home${slash}dave';`)?.kind).toBe('home-path');
    const drive = 'C:';
    expect(findCoupling(`${drive}\\Users\\erin\\work`)?.kind).toBe('home-path');
    expect(findCoupling(`${drive}\\\\Users\\\\erin\\\\work`)?.kind).toBe('home-path');
  });

  it('flags the old docs folder, the path-join form and ticket ids', () => {
    expect(findCoupling(`see ${['docs/loop', '-console'].join('')}/README`)?.kind).toBe('docs-ref');
    expect(findCoupling(`join(here, ${["'..'", " 'docs'"].join(',')}, 'x')`)?.kind).toBe('docs-ref');
    expect(findCoupling(`// ${'LC' + '-12'} follow-up`)?.kind).toBe('ticket');
  });

  it('issue refs: placeholders and digit-only hex colours are not refs, a ref in a comment is', () => {
    const ref = '#' + '260';
    expect(findCoupling('title: `Run #{n}`')).toBeNull();
    expect(findCoupling(`const t = 'Run #{n} of {total}';`)).toBeNull();
    expect(findCoupling(`color: ${'#' + '123456'};`)).toBeNull();
    expect(findCoupling(`color: ${'#' + '12345678'};`)).toBeNull();
    expect(findCoupling('&#' + '1234;')).toBeNull();
    expect(findCoupling(`// fixes ${ref}`)?.kind).toBe('issue-ref');
    expect(findCoupling(`// fixes ${'#' + '12'}`)).toBeNull();
  });

  it('issue refs: a reference that names this repository is not a hit, a bare ref or another repository still is', () => {
    const n = '#' + '102';
    const bare = '#' + '287';
    // the generated changelog link and the short cross-repository form
    expect(findCoupling(`* x ([${n}](https://github.com/hieplam/castraferrum/issues/102))`)).toBeNull();
    expect(findCoupling(`* y ([${n}](https://github.com/hieplam/castraferrum/pull/102))`)).toBeNull();
    expect(findCoupling(`epic castraferrum${'#' + '117'}`)).toBeNull();
    // a bare ref is still a hit, also when the same line carries an own-repository link
    expect(findCoupling(`see ${bare} for details`)?.kind).toBe('issue-ref');
    expect(findCoupling(`([${n}](https://github.com/hieplam/castraferrum/issues/102)) and ${bare}`)?.kind).toBe('issue-ref');
    // a link into another repository, or a link text that does not match its target, is still a hit
    expect(findCoupling(`([${bare}](https://github.com/other/repo/issues/287))`)?.kind).toBe('issue-ref');
    expect(findCoupling(`([${bare}](https://github.com/hieplam/castraferrum/issues/102))`)?.kind).toBe('issue-ref');
  });

  it('issue refs: the squash suffix of a commit subject is exempt, in --message and --history, and only there', () => {
    const suffix = ' (' + '#' + '117)';
    const dir = tmp();
    const subject = path.join(dir, 'subject.txt');
    const body = path.join(dir, 'body.txt');
    fs.writeFileSync(subject, `feat: thing${suffix}\n\nbody\n`);
    fs.writeFileSync(body, `feat: thing\n\nsee${suffix}\n`);
    expect(run(['--message', subject, '--coupling'], { root: dir }).code).toBe(0);
    expect(run(['--message', body, '--coupling'], { root: dir }).code).toBe(1);

    const root = repo({ 'a.txt': 'plain\n' });
    write(root, 'b.txt', 'plain\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', `feat: thing${suffix}`);
    expect(run(['--history', '--coupling'], { root }).code).toBe(0);
    write(root, 'c.txt', 'plain\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', `feat: thing${suffix} and more`);
    expect(run(['--history', '--coupling'], { root }).code).toBe(1);
    // the same suffix in a file line is a hit
    expect(findCoupling(`feat: thing${suffix}`)?.kind).toBe('issue-ref');
  }, 30_000);

  it('owner-specific patterns come only from the gitignored local file', () => {
    const marker = word(122, 122, 113, 113, 120); // arbitrary word, not a real name
    const root = repo({ 'server/a.ts': `// the ${marker} project\n` });
    expect(value(run(['--tree', '--coupling'], { root }), 'coupling')).toBe(0);
    write(root, '.lang-scan.local.json', JSON.stringify({ patterns: [`\\b${marker}\\b`] }));
    expect(loadLocalPatterns(root)).toHaveLength(1);
    const out = run(['--tree', '--coupling'], { root });
    expect(value(out, 'coupling')).toBe(1);
    const gitignore = fs.readFileSync(path.join(here, '..', '..', '.gitignore'), 'utf8');
    expect(gitignore).toContain('.lang-scan.local.json');
  });
});

describe('history allowlist', () => {
  const ALLOW = 'scripts/lang-history-allowlist.json';
  const blobOf = (root: string, rel: string) => git(root, 'rev-parse', `HEAD:${rel}`).trim();
  const allow = (root: string, entries: Array<{ blob: string; line: number; kind: string }>) =>
    write(root, ALLOW, JSON.stringify(entries));
  const REF = 'docs/plans/p.md';

  it('no folder is skipped: the same text under docs/plans is flagged by --tree, and an unlisted history is flagged', () => {
    const root = repo({ [REF]: `quoted ${TOKEN_A}\n`, 'docs/specs/s.md': `step ${'LC' + '-12'}\n`, 'tools/extraction-loop/b.md': `quoted ${TOKEN_A}\n` });
    expect(value(run(['--tree', '--coupling'], { root }), 'vietnamese')).toBe(2);
    expect(value(run(['--tree', '--coupling'], { root }), 'coupling')).toBe(1);
    expect(run(['--history', '--coupling'], { root }).code).toBe(1);
  });

  it('--history skips exactly the allowlisted (blob, line, kind) and nothing else', () => {
    const root = repo({ [REF]: `quoted ${TOKEN_A}\n` });
    const blob = blobOf(root, REF);
    allow(root, [{ blob, line: 1, kind: 'text' }]);
    expect(run(['--history'], { root }).code).toBe(0);
    allow(root, [{ blob, line: 2, kind: 'text' }]);
    expect(run(['--history'], { root }).code).toBe(1);
    allow(root, [{ blob, line: 1, kind: 'coupling' }]);
    expect(run(['--history'], { root }).code).toBe(1);
  });

  it('the same text in a new blob is flagged, even at the same path and line', () => {
    const root = repo({ [REF]: `quoted ${TOKEN_A}\n` });
    allow(root, [{ blob: blobOf(root, REF), line: 1, kind: 'text' }]);
    expect(run(['--history'], { root }).code).toBe(0);
    write(root, REF, `quoted ${TOKEN_A}\nmore English\n`);
    git(root, 'commit', '-q', '-am', 'edit the record');
    const out = run(['--history'], { root });
    expect(out.code).toBe(1);
    expect(value(out, 'vietnamese')).toBe(1);
  });

  it('the allowlist does not apply to --tree or --staged', () => {
    const root = repo({ [REF]: `quoted ${TOKEN_A}\n` });
    allow(root, [{ blob: blobOf(root, REF), line: 1, kind: 'text' }]);
    expect(run(['--history'], { root }).code).toBe(0);
    expect(run(['--tree', '--max', '0'], { root }).code).toBe(1);
    write(root, 'docs/plans/q.md', `quoted ${TOKEN_A}\n`);
    git(root, 'add', 'docs/plans/q.md');
    expect(run(['--staged'], { root }).code).toBe(1);
  });

  describe('commit messages, pinned by full commit SHA', () => {
    const subject = `docs: a plan (epic ${'#' + '287'})`;
    const headOf = (root: string) => git(root, 'rev-parse', 'HEAD').trim();
    type Entry = { blob?: string; commit?: string; line?: unknown; kind?: string };
    const allowAny = (root: string, entries: Entry[]) => write(root, ALLOW, JSON.stringify(entries));

    /** A repo whose second commit has a message with a bare issue reference. Returns the root and that commit. */
    function withBadMessage(): { root: string; sha: string } {
      const root = repo({ 'a.txt': 'plain\n' });
      write(root, 'b.txt', 'plain\n');
      git(root, 'add', 'b.txt');
      git(root, 'commit', '-q', '-m', subject);
      return { root, sha: headOf(root) };
    }

    it('skips exactly the allowlisted (commit, line, kind) of a commit message, and nothing else', () => {
      const { root, sha } = withBadMessage();
      expect(run(['--history', '--coupling'], { root }).code).toBe(1);
      allowAny(root, [{ commit: sha, line: 1, kind: 'coupling' }]);
      const out = run(['--history', '--coupling'], { root });
      expect(out.code).toBe(0);
      expect(value(out, 'coupling')).toBe(0);
      allowAny(root, [{ commit: sha, line: 2, kind: 'coupling' }]);
      expect(run(['--history', '--coupling'], { root }).code).toBe(1);
      allowAny(root, [{ commit: sha, line: 1, kind: 'text' }]);
      expect(run(['--history', '--coupling'], { root }).code).toBe(1);
      // a blob entry that names the commit SHA does not exempt the message
      allowAny(root, [{ blob: sha, line: 1, kind: 'coupling' }]);
      expect(run(['--history', '--coupling'], { root }).code).toBe(1);
    }, 30_000);

    it('another commit with the same message is still flagged', () => {
      const { root, sha } = withBadMessage();
      allowAny(root, [{ commit: sha, line: 1, kind: 'coupling' }]);
      expect(run(['--history', '--coupling'], { root }).code).toBe(0);
      write(root, 'c.txt', 'plain\n');
      git(root, 'add', 'c.txt');
      git(root, 'commit', '-q', '-m', subject);
      const out = run(['--history', '--coupling', '--list'], { root });
      expect(out.code).toBe(1);
      expect(out.lines.some((l) => l.includes(`commit=${headOf(root)}`))).toBe(true);
      expect(out.lines.some((l) => l.includes(`commit=${sha}`))).toBe(false);
    }, 30_000);

    it('a short, wildcard or malformed entry is refused instead of matching more than one object', () => {
      const { root, sha } = withBadMessage();
      const bad: Entry[] = [
        { commit: sha.slice(0, 7), line: 1, kind: 'coupling' },
        { commit: '*', line: 1, kind: 'coupling' },
        { commit: '', line: 1, kind: 'coupling' },
        { commit: sha.toUpperCase(), line: 1, kind: 'coupling' },
        { commit: sha, kind: 'coupling' },
        { commit: sha, line: '*', kind: 'coupling' },
        { commit: sha, line: 1, kind: '*' },
        { commit: sha, blob: sha, line: 1, kind: 'coupling' },
        { line: 1, kind: 'coupling' },
      ];
      for (const entry of bad) {
        allowAny(root, [entry]);
        const out = run(['--history', '--coupling'], { root });
        expect(out.code, JSON.stringify(entry)).toBe(2);
        expect(out.lines.join('\n')).toContain('bad entry');
      }
    }, 30_000);
  });

  it('the repository allowlist pins the open-in-terminal squash commit by its full SHA, and only that commit', () => {
    const entries = JSON.parse(fs.readFileSync(path.join(scripts, 'lang-history-allowlist.json'), 'utf8')) as Array<Record<string, unknown>>;
    const commits = entries.filter((e) => 'commit' in e);
    expect(commits).toEqual([{ commit: '066e95c3ddf1ef1118231a13765fd3b279f61556', line: 1, kind: 'coupling' }]);
  });
});

describe('output and exit codes', () => {
  it('prints the counts, a per-folder breakdown and the comment-line count', () => {
    const root = repo({
      'server/a.ts': `// ${TOKEN_A} note here\nexport const a = 1;\n`,
      'web/b.ts': '// an English comment\n',
    });
    const out = run(['--coupling'], { root });
    expect(out.lines[0]).toBe('vietnamese: 1');
    expect(out.lines[1]).toBe('coupling: 0');
    expect(out.lines[2]).toBe('comment-lines: 2');
    expect(out.lines.join('\n')).toContain('server: vietnamese 1, coupling 0, comment-lines 1');
    expect(out.lines.join('\n')).toContain('web: vietnamese 0, coupling 0, comment-lines 1');
  });

  it('--tree only reports (exit 0); --max makes it fail above the limit', () => {
    const root = repo({ 'server/a.ts': `// ${TOKEN_A}\n` });
    expect(run(['--tree'], { root }).code).toBe(0);
    expect(run(['--tree', '--max', '1'], { root }).code).toBe(0);
    expect(run(['--tree', '--max', '0'], { root }).code).toBe(1);
  });

  it('--path limits the scan to one folder or file', () => {
    const root = repo({ 'server/a.ts': `// ${TOKEN_A}\n`, 'web/b.ts': `// ${TOKEN_B}\n`, 'README.md': 'plain\n' });
    expect(value(run(['--path', 'server'], { root }), 'vietnamese')).toBe(1);
    expect(value(run(['--path', 'web/b.ts'], { root }), 'vietnamese')).toBe(1);
    expect(value(run(['--path', 'README.md'], { root }), 'vietnamese')).toBe(0);
  });

  it('--list prints path:line for every hit', () => {
    const root = repo({ 'server/a.ts': `export const a = 1;\n// ${TOKEN_A}\n` });
    const out = run(['--list'], { root });
    expect(out.lines.some((l) => l.startsWith('server/a.ts:2 '))).toBe(true);
  });

  it('rejects an unknown flag', () => {
    expect(run(['--nope']).code).toBe(2);
  });
});

describe('comment lines', () => {
  it('counts non-empty comment lines with at least three letters, per syntax', () => {
    const ts = ['// one two', '//', '// ab', '/* block start', ' * jsdoc line', ' */', 'const a = 1; // trailing is not counted', '/** single */'].join('\n');
    expect(countCommentLines(ts, 'a.ts')).toBe(4);
    expect(countCommentLines(['# shell comment', '#!/usr/bin/env node', '#', 'x=1'].join('\n'), 'a.ps1')).toBe(1);
    expect(countCommentLines(['key: 1', '# yaml note'].join('\n'), 'a.yml')).toBe(1);
    expect(countCommentLines(['<!-- html note -->', '<p>text</p>', '<!--', 'multi line', '-->'].join('\n'), 'a.html')).toBe(2);
    expect(countCommentLines('# Heading\ntext <!-- hidden note --> text\n', 'a.md')).toBe(1);
  });
});

describe('hook and CI modes', () => {
  it('--staged flags a Vietnamese added line and passes an English one', () => {
    const root = repo({ 'server/a.ts': 'export const a = 1;\n' });
    write(root, 'server/a.ts', `export const a = 1;\n// ${TOKEN_A}\n`);
    git(root, 'add', '-A');
    const bad = run(['--staged'], { root });
    expect(bad.code).toBe(1);
    expect(bad.lines.join('\n')).toContain('server/a.ts:2');
    git(root, 'reset', '-q', '--hard');
    write(root, 'server/a.ts', 'export const a = 1;\n// an English comment\n');
    git(root, 'add', '-A');
    expect(run(['--staged'], { root }).code).toBe(0);
  });

  it('--staged ignores unstaged work and old lines, and flags a staged Vietnamese file name', () => {
    const root = repo({ 'server/a.ts': `// ${TOKEN_A}\n` });
    write(root, 'server/a.ts', `// ${TOKEN_A}\nexport const a = 1;\n`);
    git(root, 'add', '-A');
    expect(run(['--staged'], { root }).code).toBe(0);
    write(root, `server/${TOKEN_B}.ts`, 'export const b = 2;\n');
    git(root, 'add', '-A');
    expect(run(['--staged'], { root }).code).toBe(1);
  });

  it('--staged skips the locale file', () => {
    const root = repo({ 'shared/i18n/vi.ts': 'export const x = 1;\n' });
    write(root, 'shared/i18n/vi.ts', `export const x = '${TOKEN_A}';\n`);
    git(root, 'add', '-A');
    expect(run(['--staged'], { root }).code).toBe(0);
  });

  it('--message flags a Vietnamese commit message and passes an English one; git comment lines are ignored', () => {
    const dir = tmp();
    const bad = path.join(dir, 'bad.txt');
    const good = path.join(dir, 'good.txt');
    fs.writeFileSync(bad, `Fix the ${TOKEN_A} case\n\nbody\n`);
    fs.writeFileSync(good, `Fix the case\n\n# ${TOKEN_A} in a git comment line\n`);
    expect(run(['--message', bad], { root: dir }).code).toBe(1);
    expect(run(['--message', good], { root: dir }).code).toBe(0);
  });

  it('--pr-event flags a Vietnamese title, body or branch name and passes an English payload', () => {
    const dir = tmp();
    const payload = (title: string, body: string, ref: string) => {
      const f = path.join(dir, `ev-${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(f, JSON.stringify({ pull_request: { title, body, head: { ref } } }));
      return f;
    };
    const opts = { root: dir };
    expect(run(['--pr-event', payload(`Fix ${TOKEN_A}`, 'ok', 'feat/x')], opts).code).toBe(1);
    expect(run(['--pr-event', payload('Fix', `line\n${TOKEN_B} here`, 'feat/x')], opts).code).toBe(1);
    expect(run(['--pr-event', payload('Fix', 'ok', `feat/${TOKEN_C}`)], opts).code).toBe(1);
    expect(run(['--pr-event', payload('Fix', null as unknown as string, 'feat/x')], opts).code).toBe(0);
    expect(run(['--pr-event', payload('Fix the thing', 'English body', 'feat/fix-thing')], opts).code).toBe(0);
  });

  it('--history finds a Vietnamese blob that exists only in an old commit', () => {
    const root = repo({ 'server/a.ts': `// ${TOKEN_A}\n` });
    write(root, 'server/a.ts', '// clean now\n');
    git(root, 'commit', '-q', '-am', 'clean up');
    expect(value(run(['--tree'], { root }), 'vietnamese')).toBe(0);
    const out = run(['--history'], { root });
    expect(out.code).toBe(1);
    expect(value(out, 'vietnamese')).toBeGreaterThan(0);
  });

  it('--history finds a Vietnamese path name and a Vietnamese commit message', () => {
    const named = repo({ [`server/${TOKEN_A}.ts`]: 'export const a = 1;\n' });
    git(named, 'rm', '-q', '-r', 'server');
    git(named, 'commit', '-q', '-m', 'remove');
    expect(run(['--history'], { root: named }).code).toBe(1);

    const msg = repo({ 'a.txt': 'plain\n' });
    write(msg, 'b.txt', 'plain\n');
    git(msg, 'add', '-A');
    git(msg, 'commit', '-q', '-m', `Fix ${TOKEN_B} bug`);
    expect(run(['--history'], { root: msg }).code).toBe(1);
  });

  it('--history passes an English history, and skips only the locale path', () => {
    const root = repo({ 'server/a.ts': '// plain\n', 'shared/i18n/vi.ts': `export const x = '${TOKEN_A}';\n` });
    write(root, 'tests/arch-fixtures/shared/i18n/vi.ts', 'export const x = 1;\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'second');
    expect(run(['--history'], { root }).code).toBe(0);
    write(root, 'tests/arch-fixtures/shared/i18n/vi.ts', `export const x = '${TOKEN_A}';\n`);
    git(root, 'commit', '-q', '-am', 'third');
    expect(run(['--history'], { root }).code).toBe(1);
  });

  it('--history --coupling also fails on coupling', () => {
    const root = repo({ 'server/a.ts': `// ${'LC' + '-12'}\n` });
    expect(run(['--history'], { root }).code).toBe(0);
    expect(run(['--history', '--coupling'], { root }).code).toBe(1);
  });
});

describe('baseline', () => {
  it('--check-baseline fails when a folder is above its entry and passes at or below it', () => {
    const root = repo({
      'server/a.ts': `// ${TOKEN_A}\n// ${TOKEN_B}\n`,
      'web/b.ts': `// ${TOKEN_A}\n`,
      'scripts/lang-baseline.json': JSON.stringify({ vietnamese: { server: 2, web: 1 }, coupling: {} }),
    });
    expect(run(['--check-baseline'], { root }).code).toBe(0);
    write(root, 'scripts/lang-baseline.json', JSON.stringify({ vietnamese: { server: 2 }, coupling: {} }));
    const out = run(['--check-baseline'], { root });
    expect(out.code).toBe(1);
    expect(out.lines.join('\n')).toContain('ABOVE BASELINE: web vietnamese 1 > 0');
    write(root, 'scripts/lang-baseline.json', JSON.stringify({ vietnamese: { server: 1, web: 1 }, coupling: {} }));
    expect(run(['--check-baseline'], { root }).code).toBe(1);
  });

  it('--check-baseline also checks coupling', () => {
    const root = repo({
      'server/a.ts': `// ${'LC' + '-12'}\n`,
      'scripts/lang-baseline.json': JSON.stringify({ vietnamese: {}, coupling: {} }),
    });
    expect(run(['--check-baseline'], { root }).code).toBe(1);
    write(root, 'scripts/lang-baseline.json', JSON.stringify({ vietnamese: {}, coupling: { server: 1 } }));
    expect(run(['--check-baseline'], { root }).code).toBe(0);
  });

  it('--write-baseline records the measured per-folder counts', () => {
    const root = repo({ 'server/a.ts': `// ${TOKEN_A}\n`, 'scripts/x.txt': 'plain\n' });
    expect(run(['--write-baseline'], { root }).code).toBe(0);
    const written = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'lang-baseline.json'), 'utf8'));
    expect(written).toEqual({ vietnamese: { server: 1 }, coupling: {} });
    expect(run(['--check-baseline'], { root }).code).toBe(0);
  });
});

describe('the scanner scans itself', () => {
  it('its own source and tests contain no hit of any class', () => {
    const files = [path.join(scripts, 'lang-scan.mjs'), fileURLToPath(import.meta.url)];
    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        expect(findVietnamese(line), `${path.basename(f)}:${i + 1}`).toBeNull();
        expect(findCoupling(line), `${path.basename(f)}:${i + 1}`).toBeNull();
      });
      expect(findVietnamese(path.basename(f))).toBeNull();
    }
  });
});
