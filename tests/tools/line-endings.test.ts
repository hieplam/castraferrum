// `.gitattributes` holds `* -text`, so git converts nothing: a CR byte in the index is a real byte in the file.
// So a tracked text file with CRLF or mixed line endings is a defect, and this test lists each such file.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

it('no tracked text file holds a CR byte', () => {
  const eol = execFileSync('git', ['ls-files', '--eol'], { cwd: ROOT, encoding: 'utf8' });
  const bad = eol
    .split('\n')
    .filter((line) => line.startsWith('i/crlf') || line.startsWith('i/mixed'))
    .map((line) => line.slice(line.indexOf('\t') + 1));
  expect(bad).toEqual([]);
});
