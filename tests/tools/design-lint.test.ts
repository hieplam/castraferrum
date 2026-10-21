import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssClasses, lintCss, lintRepo, lintTsx } from '../../scripts/design-lint.mjs';

type Unknown = { file: string; cls: string };
const known = new Set(['row', 'is-sel', 'btn']);
const tsx = (body: string) => lintTsx('web/x.tsx', `export const X = () => (${body});`, known);
const unknownOf = (body: string) => tsx(body).unknown.map((u: Unknown) => u.cls);

describe('design-lint, web', () => {
  it('title on a div and on Button counts; title on Dialog does not', () => {
    expect(tsx('<div title="a" />').titles).toHaveLength(1);
    expect(tsx('<Button title="a">x</Button>').titles).toHaveLength(1);
    expect(tsx('<Dialog title="a" />').titles).toHaveLength(0);
  });

  it('class tokens: className strings, cx() arguments, && and ?: branches', () => {
    expect(unknownOf('<div className="row nope" />')).toEqual(['nope']);
    expect(unknownOf("<div className={cx('row', cond && 'x')} />")).toEqual(['x']);
    expect(unknownOf("<div className={cx(a ? 'btn' : 'y')} />")).toEqual(['y']);
    expect(unknownOf("<div className={'btn'} />")).toEqual([]);
  });

  it('a dynamic template class is counted as not checked', () => {
    const r = tsx('<div className={`row ${kind}`} />');
    expect(r.dynamic).toHaveLength(1);
    expect(r.unknown).toEqual([]);
  });

  it('a literal style: colour, px string, number on a length property; tokens and custom properties are fine', () => {
    expect(tsx("<div style={{ color: '#fff', padding: '4px', width: 12 }} />").literal).toHaveLength(3);
    expect(tsx("<div style={{ border: 'var(--border-w) solid var(--border)', ['--cols' as string]: 3, flex: 1 }} />").literal).toHaveLength(0);
  });

  it('a classic-only class in a file not on the classic list is unknown', () => {
    const root = mkdtempSync(join(tmpdir(), 'design-lint-'));
    const put = (p: string, s: string) => {
      mkdirSync(dirname(join(root, p)), { recursive: true });
      writeFileSync(join(root, p), s);
    };
    put('design/components.css', '.classic-row { color: var(--text); }');
    put('design/ds/components.css', '.ds-row { color: var(--text); }');
    put('scripts/classic-ui-files.json', JSON.stringify(['web/old/Old.tsx']));
    put('web/old/Old.tsx', 'export const A = () => <div className="classic-row ds-row" />;');
    put('web/new/New.tsx', 'export const B = () => <div className="classic-row ds-row" />;');
    put('web/new/New.test.tsx', 'export const C = () => <div className="ignored" title="x" />;');
    const r = lintRepo(root);
    expect(r.unknown.map((u: Unknown) => `${u.file} ${u.cls}`)).toEqual(['web/new/New.tsx classic-row']);
    expect(r.titles).toHaveLength(0);
    rmSync(root, { recursive: true });
  });

  it('reads class selectors from CSS, not from values', () => {
    const css = '.a, .b:hover > .c { background: url(x.png); opacity: .5 } @media (min-resolution: 1.5dppx) { .d {} }';
    expect([...cssClasses(css)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('design-lint, CSS', () => {
  const v = (css: string) => lintCss('design/ds/components.css', css);
  it('flags colour literals and px/rem/em lengths in values', () => {
    expect(v('.a { color: #fff; }')).toHaveLength(1);
    expect(v('.a { padding: 12px; }')).toHaveLength(1);
    expect(v('.a { border-bottom: 1px solid var(--border); }')).toHaveLength(1);
    expect(v('.a { grid-template-columns: 1fr 340px; }')).toHaveLength(1);
    expect(v('.a { backdrop-filter: blur(20px); }')).toHaveLength(1);
  });

  it('flags :hover outside the hover media query, with file:line', () => {
    const r = v('.a { color: var(--x); }\n.a:hover { color: var(--y); }');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/^design\/ds\/components\.css:2 /);
    expect(v('@media (hover: hover) and (pointer: fine) { .a:hover { color: var(--y); } }')).toEqual([]);
  });

  it('allows calc with a negative factor, 0, %, viewport units, fr, unitless numbers and media query conditions', () => {
    const css = '@media (max-width: 600px) { .a { margin: calc(var(--space-2) * -1); width: 100%; top: 0; height: 100dvh; ' +
      'grid-template-columns: 1fr 2fr; line-height: 1.4; } }';
    expect(v(css)).toEqual([]);
  });
});
