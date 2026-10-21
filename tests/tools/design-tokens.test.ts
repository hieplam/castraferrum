import { describe, expect, it } from 'vitest';
import { checkTokens, contrastRatio, parseTokens } from '../../scripts/design-tokens.mjs';

const light = (body: string) => `:root, [data-theme="light"] {\n${body}\n}\n`;
const dark = (body: string) => `:root[data-theme="dark"], [data-theme="dark"] {\n${body}\n}\n`;

describe('design-tokens', () => {
  it('an empty dark value counts as empty and as missing in dark', () => {
    const r = checkTokens(light('--surface: #fbf9f4;') + dark('--surface: ;'));
    expect(r.empty).toEqual(['--surface']);
    expect(r.missingDark).toEqual(['--surface']);
  });

  it('a declaration with no value swallows the next one', () => {
    const r = checkTokens(light('--surface: #fff; --surface-2: #eee;') + dark('--surface:\n  --surface-2: #1a1a1a;'));
    expect(r.empty).toEqual(['--surface']);
    expect(r.missingDark).toEqual(['--surface', '--surface-2']);
  });

  it('a light colour missing in dark is listed; a non-colour light token is not', () => {
    const r = checkTokens(light('--accent: rgb(1, 2, 3); --space-1: 4px; --ok: var(--accent);') + dark('--other: #0a0a0a;'));
    expect(r.missingDark).toEqual(['--accent']);
  });

  it('two :root rules merge in file order; @media rules are only checked for empty values', () => {
    const css = light('--a: #fff;') + ':root { --b: #0a0a0a; --a: #eee; }\n' + dark('--a: #1a1a1a;') +
      '@media (max-width: 600px) { :root { --b: ; } }\n';
    const t = parseTokens(css);
    expect(t.light.get('--a')).toBe('#eee');
    expect(t.light.get('--b')).toBe('#0a0a0a');
    const r = checkTokens(css);
    expect(r.missingDark).toEqual(['--b']);
    expect(r.empty).toEqual(['--b']);
  });

  it('semicolons inside parentheses and comments do not split declarations', () => {
    const t = parseTokens('@import url("a;b");\n/* --x: ; */\n' + light('--shadow: 0 0 0 rgba(0, 0, 0, .2); --y: #fff;'));
    expect(t.light.get('--shadow')).toBe('0 0 0 rgba(0, 0, 0, .2)');
    expect(t.light.get('--y')).toBe('#fff');
    expect(checkTokens('/* --x: ; */' + light('--y: #fff;')).empty).toEqual([]);
  });

  it('a failing pair is reported per theme with its ratio', () => {
    const css = light('--text: #22201b; --surface-2: #ece7dc;') + dark('--text: #d9e0d2; --surface:\n --surface-2: #181b16;');
    const r = checkTokens(css, { pairs: [{ fg: '--text', bg: '--surface-2', min: 4.5 }] });
    expect(r.pairsChecked).toBe(2);
    expect(r.contrast).toEqual(['contrast dark --text on --surface-2: 1.10 < 4.5']);
  });

  it('a var() pair resolves through the theme, then the light value', () => {
    const css = light('--ink: #000000; --fg: var(--ink); --bg: #ffffff;') + dark('--ink: #ffffff;');
    const r = checkTokens(css, { pairs: [{ fg: '--fg', bg: '--bg', min: 4.5 }] });
    expect(r.contrast).toEqual(['contrast dark --fg on --bg: 1.00 < 4.5']);
    expect(contrastRatio('rgb(0, 0, 0)', '#fff')).toBeCloseTo(21, 5);
  });

  it('a required token is missing when the light set lacks it, or the dark set lacks a colour token', () => {
    const css = light('--a: #fff; --b: 4px; --c: #0a0a0a;') + dark('--c: #1a1a1a;');
    const r = checkTokens(css, { require: ['--a', '--b', '--c', '--d'] });
    expect(r.required).toBe(4);
    expect(r.missing).toEqual(['--a', '--d']);
  });
});
