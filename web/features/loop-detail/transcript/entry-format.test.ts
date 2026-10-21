// Rules for folding / the subject line / the per-field input of a transcript entry (D-UI29) - the same rules preview.js draws with.
import { describe, expect, it } from 'vitest';
import { fieldsText, firstLine, shouldFold, toolFields, toolSubject, txSize } from './entry-format';

describe('entry-format', () => {
  it('folds when > 30 lines or > 3 000 characters; a Prompt folds when > 1 line', () => {
    expect(shouldFold(Array(30).fill('x').join('\n'))).toBe(false);
    expect(shouldFold(Array(31).fill('x').join('\n'))).toBe(true);
    expect(shouldFold('x'.repeat(3000))).toBe(false);
    expect(shouldFold('x'.repeat(3001))).toBe(true);
    expect(shouldFold('one line', true)).toBe(false);
    expect(shouldFold('a\nb', true)).toBe(true);
  });

  it('first non-empty line; size by UTF-8 bytes, decimal mark by language', () => {
    expect(firstLine('\n  \nfirst\nsecond')).toBe('first');
    expect(txSize('\u00e9', 'vi')).toBe('2 B');
    expect(txSize('x'.repeat(6042), 'vi')).toBe('5,9 KB');
    expect(txSize('x'.repeat(6042), 'en')).toBe('5.9 KB');
  });

  it('subject line: command before description; no preferred field -> any string; first line only', () => {
    expect(toolSubject(JSON.stringify({ description: 'description', command: 'gh issue list\n--json' }))).toBe('gh issue list');
    expect(toolSubject(JSON.stringify({ n: 1, other: 'other' }))).toBe('other');
    expect(toolSubject('not json')).toBe('');
  });

  it('input by field: a string keeps real line breaks, other values print as pretty JSON; not an object -> null', () => {
    const f = toolFields(JSON.stringify({ command: 'echo one\necho two', timeout: 5, opts: { a: true } }));
    expect(f).toEqual([
      ['command', 'echo one\necho two'],
      ['timeout', '5'],
      ['opts', '{\n  "a": true\n}'],
    ]);
    expect(fieldsText(f!)).toBe('command:\necho one\necho two\ntimeout:\n5\nopts:\n{\n  "a": true\n}');
    expect(toolFields('[1,2]')).toBeNull();
    expect(toolFields('{}')).toBeNull();
  });
});
