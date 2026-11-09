import { describe, expect, it } from 'vitest';
import { fingerprint, firstFailingLine, sha256Hex } from './fingerprint';

const a = 'ok 1\nFAIL tests/api/x.test.ts > loads 12 rows at 2026-11-01T10:00:00Z (abcdef1234)\nmore';
const b = 'FAIL tests/api/y.test.ts > loads 99 rows at 2026-11-02 23:59:01 (0123456789ab)';
const c = 'FAIL tests/api/x.test.ts > saves rows';

describe('fingerprint', () => {
  it('gives the same golden hash for two failures that differ only in path, number, time and hex', () => {
    expect(fingerprint('hieplam/tribe', 'H1', a)).toBe('b429f5546b75');
    expect(fingerprint('hieplam/tribe', 'H1', b)).toBe('b429f5546b75');
  });

  it('gives another golden hash for another failing line', () => {
    expect(fingerprint('hieplam/tribe', 'H1', c)).toBe('3529c9c59972');
  });

  it('gives another golden hash for another row', () => {
    expect(fingerprint('hieplam/tribe', 'H2', a)).toBe('059e30e2987a');
  });

  it('gives another golden hash for another repository', () => {
    expect(fingerprint('hieplam/castraferrum', 'H1', a)).toBe('bdbc3c16acfc');
  });

  it('skips a line with no failing word before the first failing line', () => {
    expect(fingerprint('hieplam/tribe', 'H1', `ok 1\n${b}`)).toBe('b429f5546b75');
    expect(firstFailingLine(`ok 1\r\n${b}\r\nmore`)).toBe(b);
    expect(firstFailingLine('ok 1\n  × loads rows\nfailed later')).toBe('  × loads rows');
  });

  it('uses the last non-empty line when no line has a failing word, and an empty text when there is no line', () => {
    expect(firstFailingLine('one\ntwo\n\n  \n')).toBe('two');
    expect(fingerprint('hieplam/tribe', 'H1', 'one\ntwo\n')).toBe(fingerprint('hieplam/tribe', 'H1', 'two'));
    expect(firstFailingLine('\n \n')).toBe('');
  });

  it('is 12 lower-case hex characters, from a sha256 that matches Node at each block boundary', () => {
    expect(fingerprint('hieplam/tribe', 'H1', '')).toMatch(/^[0-9a-f]{12}$/);
    // Each pair is a number of two-byte characters and the output of createHash('sha256') for them: 54, 56, 62, 64, 118 and 128 bytes pass a boundary.
    const vectors: [number, string][] = [
      [0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
      [27, '2276e051a6111964a16d9b9a7d073ae9a52d2ed9aebf654820a8c59a552f95cc'],
      [28, 'a2e7c1f809d17958e21b7cd370a1d7d030e07f3af72588be133d4f73fadee71d'],
      [31, 'f299f682f8ab27d5a1e24784fb220657d1d4c52e07988895131dbc1eae0e2e55'],
      [32, '2e5152e606afb24d5817608407516dfec44866c8ed63edbb537953895bd07aa9'],
      [59, '0a4ba9f38e9c085f864d0e8e3cbb91003306c5babb12c4e05abdffebb0b9b0ac'],
      [64, '845836d7e680de9961df321148f8cb5e8a7da92aba65f5b05b817c3b58256bd5'],
      [200, 'df20b2aa6262e99e133aa7f3614be707d35c4155d17e2aa7cbb49da555a454c3'],
    ];
    for (const [n, hex] of vectors) expect(sha256Hex('\u00e9'.repeat(n))).toBe(hex);
  });
});
