// The ↳ summary line under a run row (D-UI23 / D-UI25): the first non-empty line, capped at 80 code points, "…" when text remains.
import { describe, expect, it } from 'vitest';
import { summaryLine } from './format';

describe('summaryLine', () => {
  it('no text -> null (the web shows —)', () => {
    expect(summaryLine(null)).toBeNull();
    expect(summaryLine('')).toBeNull();
    expect(summaryLine(' \n\t\n ')).toBeNull();
  });
  it('a short single line -> verbatim, surrounding whitespace dropped, no "…"', () => {
    expect(summaryLine('  Skipped this run: #25 carries loop:needs-human.  ')).toBe('Skipped this run: #25 carries loop:needs-human.');
  });
  it('longer than 80 -> first 80 characters + "…"; exactly 80 -> no "…"', () => {
    const s = 'X'.repeat(81);
    expect(summaryLine(s)).toBe('X'.repeat(80) + '…');
    expect(summaryLine('a'.repeat(80))).toBe('a'.repeat(80));
  });
  it('counts by code point (an emoji outside the BMP is 1 character)', () => {
    const s = '😀'.repeat(81);
    expect(summaryLine(s)).toBe('😀'.repeat(80) + '…');
  });
  it('several lines -> the first non-empty line + "…" even when short', () => {
    expect(summaryLine('\n\n  Did #27  \r\nPR #26 merged.')).toBe('Did #27…');
    expect(summaryLine('Did #27\n   \n')).toBe('Did #27');
  });
});
