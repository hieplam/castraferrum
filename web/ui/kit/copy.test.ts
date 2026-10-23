// Copy to the clipboard over plain HTTP (spec D15): the clipboard API only in a secure context that has it, the hidden textarea
// otherwise (a phone opening the console at http://<ip> has no navigator.clipboard).
import { describe, expect, it } from 'vitest';
import { copyMethod } from './copy';

describe('copyMethod', () => {
  it('a secure context with a clipboard uses the clipboard', () => {
    expect(copyMethod(true, true)).toBe('clipboard');
  });
  it('an insecure context uses the textarea, even when a clipboard object exists', () => {
    expect(copyMethod(false, true)).toBe('textarea');
    expect(copyMethod(false, false)).toBe('textarea');
  });
  it('a secure context without a clipboard uses the textarea', () => {
    expect(copyMethod(true, false)).toBe('textarea');
  });
});
