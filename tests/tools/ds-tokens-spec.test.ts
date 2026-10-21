// The new design-system tokens against the spec (UI uplift, task U2): every value of spec 4.1 and 4.2 is read from the
// spec's tables and compared with design/ds/tokens.css, and the 63 contrast pairs are generated from the bullets of 4.3.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCss } from '../../scripts/design-tokens.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SPEC = read('docs/specs/2026-10-21-ui-uplift.md');
const TOKENS = 'design/ds/tokens.css';
const LIGHT = ':root, [data-theme="light"]';
const DARK = ':root[data-theme="dark"], [data-theme="dark"]';
const PHONE = '@media (max-width: 639.98px)';
const REDUCED = '@media (prefers-reduced-motion: reduce)';

/** The body of a spec section, from its heading to the next heading of level 3 or less. */
function section(heading: string): string {
  const start = SPEC.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`spec heading not found: ${heading}`);
  const rest = SPEC.slice(start + heading.length + 2);
  const end = rest.search(/\n#{1,3} /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The body rows of the first table in a section, each split into trimmed cells. */
function tableRows(body: string): string[][] {
  const lines = body.split('\n').filter((l) => l.startsWith('|'));
  return lines.slice(2).map((l) => l.slice(1, -1).split('|').map((c) => c.trim()));
}

const ticked = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

/** Splits a cell on `, ` and ` / ` outside backticks; backticked parts stay as they are. */
function splitCell(cell: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let inTick = false;
  for (let i = 0; i < cell.length; i++) {
    const c = cell[i]!;
    if (c === '`') inTick = !inTick;
    if (!inTick && (cell.startsWith(', ', i) || cell.startsWith(' / ', i))) {
      parts.push(cur);
      cur = '';
      i += cell.startsWith(', ', i) ? 1 : 2;
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim());
}

/** The values of a 4.2 cell: backticked parts as they are, a unit after the last number applies to every bare number. */
function cellValues(cell: string): string[] {
  const parts = splitCell(cell);
  const unit = /^-?[\d.]+\s*([a-z%]+)$/.exec(parts.at(-1)!)?.[1];
  return parts.map((p) => {
    if (p.startsWith('`') && p.endsWith('`')) return p.slice(1, -1);
    const m = /^(-?[\d.]+)\s*([a-z%]*)$/.exec(p);
    if (!m) return p;
    return m[1]! + (m[2] || unit || '');
  });
}

type Rule = { prelude: string; at: string[]; parents: string[]; decls: { name: string; value: string }[] };

/** The custom properties of the top-level rules with this prelude (inside `at` when given), last value wins. */
function decls(rules: Rule[], prelude: string, at?: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rules) {
    if (r.prelude !== prelude || r.parents.length) continue;
    if (at ? r.at.length !== 1 || r.at[0] !== at : r.at.length) continue;
    for (const d of r.decls) out.set(d.name, d.value);
  }
  return out;
}

const colours = tableRows(section('### 4.1 Colour tokens')).map(([name, light, dark]) => ({
  names: ticked(name!), light: ticked(light!), dark: ticked(dark!),
}));
const scales = tableRows(section('### 4.2 Type, space, size, radius, motion, layers')).map(([name, desktop, phone]) => {
  const d = cellValues(desktop!);
  return { names: ticked(name!), desktop: d, phone: phone === 'same' ? d : cellValues(phone!) };
});

/** The pairs of spec 4.3: each bullet is `<clause>; <clause>: <min>`, each clause `<fgs> on <bgs>`. */
function specPairs(): { fg: string; bg: string; min: number }[] {
  const out: { fg: string; bg: string; min: number }[] = [];
  const bullets = section('### 4.3 Contrast pairs').split(/\n- /).slice(1).map((b) => b.replace(/\s*\n\s*/g, ' ').trim());
  for (const bullet of bullets) {
    const colon = bullet.lastIndexOf(': ');
    const min = Number(/[\d.]+/.exec(bullet.slice(colon + 2))![0]);
    for (const clause of bullet.slice(0, colon).split('; ')) {
      const [left, right] = clause.split(/ on (.*)/s);
      for (const fg of ticked(left!)) {
        for (const bg of ticked(right!)) out.push({ fg, bg: bg.startsWith('-') && !bg.startsWith('--') ? fg + bg : bg, min });
      }
    }
  }
  return out;
}

describe('design/ds tokens against spec 4.1 to 4.3', () => {
  const css = existsSync(join(ROOT, TOKENS)) ? read(TOKENS) : '';
  const rules = parseCss(css).rules as Rule[];

  it('the spec tables parse into 41 colour names and 99 other names', () => {
    for (const c of colours) {
      expect(c.light.length, c.names.join()).toBe(c.names.length);
      expect(c.dark.length, c.names.join()).toBe(c.names.length);
    }
    for (const s of scales) {
      expect(s.desktop.length, s.names.join()).toBe(s.names.length);
      expect(s.phone.length, s.names.join()).toBe(s.names.length);
    }
    expect(colours.flatMap((c) => c.names)).toHaveLength(41);
    expect(scales.flatMap((s) => s.names)).toHaveLength(99);
  });

  it('the file exists, sets color-scheme per theme and imports no web font', () => {
    expect(existsSync(join(ROOT, TOKENS)), `${TOKENS} is missing`).toBe(true);
    const own = (prelude: string) => rules.find((r) => r.prelude === prelude && !r.at.length)?.decls ?? [];
    expect(own(LIGHT).find((d) => d.name === 'color-scheme')?.value).toBe('light');
    expect(own(DARK).find((d) => d.name === 'color-scheme')?.value).toBe('dark');
    expect(css).not.toMatch(/@import|@font-face/);
    expect(css).toContain('design/ds/SYSTEM.md');
  });

  it('every colour of 4.1 has the spec value in light and in dark', () => {
    const light = decls(rules, LIGHT);
    const dark = decls(rules, DARK);
    for (const c of colours) {
      c.names.forEach((name, i) => {
        expect(light.get(name), `light ${name}`).toBe(c.light[i]);
        expect(dark.get(name), `dark ${name}`).toBe(c.dark[i]);
      });
    }
  });

  it('every value of 4.2 is declared in :root, and each phone value that differs in the phone block', () => {
    const root = decls(rules, ':root');
    const phone = decls(rules, ':root', PHONE);
    for (const s of scales) {
      s.names.forEach((name, i) => {
        expect(root.get(name), `desktop ${name}`).toBe(s.desktop[i]);
        if (s.phone[i] !== s.desktop[i]) expect(phone.get(name), `phone ${name}`).toBe(s.phone[i]);
        else expect(phone.has(name), `phone ${name} repeats desktop`).toBe(false);
      });
    }
  });

  it('the three durations are 0ms under prefers-reduced-motion', () => {
    const reduced = decls(rules, ':root', REDUCED);
    for (const name of ['--dur-fast', '--dur-base', '--dur-sheet']) expect(reduced.get(name), name).toBe('0ms');
  });

  it('required-tokens.json holds every name of 4.1 and 4.2', () => {
    const required = JSON.parse(read('design/ds/required-tokens.json')) as string[];
    const names = [...colours, ...scales].flatMap((r) => r.names);
    expect(required.slice(0, names.length)).toEqual(names);
    expect(new Set(required).size).toBe(required.length);
  });

  it('contrast-pairs.json equals the 63 pairs of the 4.3 bullets', () => {
    const pairs = specPairs();
    expect(pairs).toHaveLength(63);
    expect((JSON.parse(read('design/ds/contrast-pairs.json')) as { pairs: unknown[] }).pairs).toEqual(pairs);
  });
});

