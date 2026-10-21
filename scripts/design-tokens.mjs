// npm run design:tokens -- <tokens.css> [--pairs <json>] [--require <json>] [--max-empty n] [--max-missing-dark n]
//   [--max-contrast n] [--max-missing n]
// Checks one token file of the design system (UI uplift, task U0):
//   - "empty or swallowed": custom properties whose value is empty, or starts with `--name:` (a declaration with no
//     value swallows the next one), in any rule;
//   - "missing in dark": light tokens holding a colour literal with no valid declaration in the dark set;
//   - --pairs {"pairs":[{"fg","bg","min"}]}: the WCAG 2 contrast of each pair in each theme;
//   - --require ["--name", ...]: tokens that must exist (in dark too, for a colour token).
// Light set = top-level rules whose selector list holds `:root` or `[data-theme="light"]`; dark set = top-level rules
// whose selector list holds `[data-theme="dark"]`. Rules of one set merge in file order; rules inside an at-rule are only
// checked for empty values. Every maximum defaults to 0; a count above its maximum exits 1.
// The CSS walker below (parseCss) is also used by scripts/design-lint.mjs.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

/** Comments become spaces (newlines kept), so offsets and line numbers stay right. */
export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
}

/** Line number (1-based) of an offset. */
export function lineAt(css, offset) {
  let n = 1;
  for (let i = 0; i < offset && i < css.length; i++) if (css[i] === '\n') n++;
  return n;
}

/**
 * Walks a stylesheet. Returns every rule (nested ones too) as
 * `{ prelude, at: [enclosing at-rule preludes], parents: [enclosing rule preludes], decls: [{ name, value, offset }] }`.
 * Declarations split at semicolons outside parentheses and strings.
 */
export function parseCss(source) {
  const css = stripComments(source);
  const rules = [];
  const close = (from) => {
    let depth = 0;
    let quote = '';
    for (let i = from; i < css.length; i++) {
      const c = css[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth++;
      else if (c === '}') {
        if (depth === 0) return i;
        depth--;
      }
    }
    return css.length;
  };
  const block = (start, end, at, parents, own) => {
    let i = start;
    let paren = 0;
    let quote = '';
    let item = start;
    const decl = (from, to) => {
      const text = css.slice(from, to);
      const colon = text.indexOf(':');
      if (colon < 0 || !own) return;
      const lead = text.length - text.trimStart().length;
      own.decls.push({ name: text.slice(0, colon).trim(), value: text.slice(colon + 1).trim(), offset: from + lead });
    };
    for (; i < end; i++) {
      const c = css[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '(') paren++;
      else if (c === ')') paren = Math.max(0, paren - 1);
      else if (paren === 0 && c === ';') {
        decl(item, i);
        item = i + 1;
      } else if (paren === 0 && c === '{') {
        const prelude = css.slice(item, i).trim();
        const stop = close(i + 1);
        if (prelude.startsWith('@')) {
          const inner = css.slice(i + 1, stop);
          if (inner.includes('{')) block(i + 1, stop, [...at, prelude], parents, null);
          else {
            const rule = { prelude, at, parents, decls: [], offset: item };
            rules.push(rule);
            block(i + 1, stop, at, parents, rule);
          }
        } else {
          const rule = { prelude, at, parents, decls: [], offset: item + (css.slice(item, i).length - css.slice(item, i).trimStart().length) };
          rules.push(rule);
          block(i + 1, stop, at, [...parents, prelude], rule);
        }
        i = stop;
        item = stop + 1;
      }
    }
    if (css.slice(item, end).trim()) decl(item, end);
  };
  block(0, css.length, [], [], null);
  return { css, rules };
}

const COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
export const hasColourLiteral = (value) => COLOUR.test(value);
const isInvalid = (value) => value === '' || /^--[\w-]+\s*:/.test(value);
const selectors = (prelude) => prelude.split(',').map((s) => s.trim());

/**
 * The token sets of a file: `light` and `dark` map each custom property to its last valid value; `empty` lists the
 * custom properties declared empty or swallowed anywhere, in file order.
 */
export function parseTokens(source) {
  const light = new Map();
  const dark = new Map();
  const empty = [];
  for (const rule of parseCss(source).rules) {
    const sels = selectors(rule.prelude);
    const top = rule.at.length === 0 && rule.parents.length === 0;
    const set = !top ? null
      : sels.some((s) => s.includes('[data-theme="dark"]')) ? dark
      : sels.some((s) => s.includes(':root') || s.includes('[data-theme="light"]')) ? light
      : null;
    for (const d of rule.decls) {
      if (!d.name.startsWith('--')) continue;
      if (isInvalid(d.value)) {
        if (!empty.includes(d.name)) empty.push(d.name);
      } else set?.set(d.name, d.value);
    }
  }
  return { light, dark, empty };
}

function channel(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` / `rgba()` → [r, g, b] (0-255), or null. */
export function parseColour(value) {
  const v = value.trim();
  let m = /^#([0-9a-fA-F]{3,8})$/.exec(v);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((x) => x + x).join('');
    else if (h.length === 8) h = h.slice(0, 6);
    else if (h.length !== 6) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/** WCAG 2 contrast ratio of two colours (alpha ignored). */
export function contrastRatio(a, b) {
  const lum = (c) => {
    const rgb = parseColour(c);
    if (!rgb) return null;
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  };
  const la = lum(a);
  const lb = lum(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A token's value in a theme: the theme's own valid value, else the light value; `var(--z)` resolves the same way. */
function resolve(tokens, theme, name, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const raw = (theme === 'dark' ? tokens.dark.get(name) : undefined) ?? tokens.light.get(name);
  if (raw === undefined) return null;
  const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(raw);
  if (m) return resolve(tokens, theme, m[1], seen) ?? (m[2] ? m[2].trim() : null);
  return raw;
}

/**
 * Runs every check on one token file. `pairs` = [{ fg, bg, min }], `require` = [names].
 * Returns { empty, missingDark, contrast: [failure lines], pairsChecked, required, missing }.
 */
export function checkTokens(source, { pairs, require } = {}) {
  const tokens = parseTokens(source);
  const missingDark = [...tokens.light].filter(([name, value]) => hasColourLiteral(value) && !tokens.dark.has(name)).map(([name]) => name);
  const contrast = [];
  let pairsChecked = 0;
  for (const theme of ['light', 'dark']) {
    for (const p of pairs ?? []) {
      pairsChecked++;
      const fg = resolve(tokens, theme, p.fg);
      const bg = resolve(tokens, theme, p.bg);
      const ratio = fg && bg ? contrastRatio(fg, bg) : null;
      if (ratio === null) contrast.push(`contrast ${theme} ${p.fg} on ${p.bg}: unresolved < ${p.min}`);
      else if (ratio < p.min) contrast.push(`contrast ${theme} ${p.fg} on ${p.bg}: ${ratio.toFixed(2)} < ${p.min}`);
    }
  }
  const missing = (require ?? []).filter((name) => {
    const value = tokens.light.get(name);
    return value === undefined || (hasColourLiteral(value) && !tokens.dark.has(name));
  });
  return { empty: tokens.empty, missingDark, contrast, pairsChecked, required: require?.length ?? 0, missing };
}

const list = (names) => (names.length ? ` (${names.join(' ')})` : '');

/**
 * Checks one file against its maxima and returns { lines, ok }. `opts`: { pairs, require, maxEmpty, maxMissingDark,
 * maxContrast, maxMissing } (paths to JSON files for pairs and require; maxima default to 0).
 */
export function runTokens(file, opts = {}) {
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const pairs = opts.pairs ? read(opts.pairs).pairs : undefined;
  const require = opts.require ? read(opts.require) : undefined;
  const r = checkTokens(readFileSync(file, 'utf8'), { pairs, require });
  const lines = [`${file}`, `empty or swallowed: ${r.empty.length}${list(r.empty)}`, `missing in dark: ${r.missingDark.length}${list(r.missingDark)}`];
  let ok = r.empty.length <= (opts.maxEmpty ?? 0) && r.missingDark.length <= (opts.maxMissingDark ?? 0);
  if (pairs) {
    lines.push(...r.contrast, `contrast pairs checked: ${r.pairsChecked}`, `contrast failures: ${r.contrast.length}`);
    ok &&= r.contrast.length <= (opts.maxContrast ?? 0);
  }
  if (require) {
    lines.push(`required tokens: ${r.required}`, `missing tokens: ${r.missing.length}${list(r.missing)}`);
    ok &&= r.missing.length <= (opts.maxMissing ?? 0);
  }
  return { lines, ok };
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      pairs: { type: 'string' }, require: { type: 'string' }, 'max-empty': { type: 'string' }, 'max-missing-dark': { type: 'string' },
      'max-contrast': { type: 'string' }, 'max-missing': { type: 'string' },
    },
  });
  const file = positionals[0];
  if (!file) {
    console.error('usage: design-tokens.mjs <tokens.css> [--pairs <json>] [--require <json>] [--max-empty n] [--max-missing-dark n] [--max-contrast n] [--max-missing n]');
    process.exit(2);
  }
  const n = (v) => (v === undefined ? 0 : Number(v));
  const r = runTokens(file, {
    pairs: values.pairs, require: values.require, maxEmpty: n(values['max-empty']), maxMissingDark: n(values['max-missing-dark']),
    maxContrast: n(values['max-contrast']), maxMissing: n(values['max-missing']),
  });
  console.log(r.lines.join('\n'));
  process.exit(r.ok ? 0 : 1);
}

if (import.meta.main) main();
