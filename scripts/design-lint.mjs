// npm run design:lint [-- --max-title n] [--max-unknown n] [--max-literal n]
// The design-system rule as a check (UI uplift, task U0; CLAUDE.md, "Design system first").
// Web rules, over web/**/*.tsx except tests (parsed with the TypeScript compiler API):
//   - native title: a JSX `title` attribute on an intrinsic element or on Button, IconButton, ActionButton;
//   - unknown classes: class tokens of `className="..."`, `className={'...'}` and the string arguments of `cx(...)`
//     (the right side of `&&` and both branches of `? :` included) that no class selector of the design CSS defines.
//     With scripts/classic-ui-files.json, the files it lists are checked against design/components.css plus
//     design/ds/components.css, every other file against design/ds/components.css only; without it, every file is checked
//     against the design CSS files that exist;
//   - dynamic classes: template literals with expressions in those places (counted, not checked);
//   - literal styles: properties of a `style={{...}}` object holding a colour literal, a px/rem/em string, or a number on
//     a length property.
// CSS rules, over design/ds/components.css when it exists: a colour literal, a px/rem/em length in a declaration value
// (media query conditions are exempt), a `:hover` selector outside `@media (hover: hover) and (pointer: fine)`.
// Maxima default to 0; exit 1 when `css violations` is above 0 or another count is above its maximum.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import ts from 'typescript';
import { hasColourLiteral, lineAt, parseCss } from './design-tokens.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLASSIC_CSS = 'design/components.css';
const DS_CSS = 'design/ds/components.css';
const CLASSIC_LIST = 'scripts/classic-ui-files.json';
const TITLE_COMPONENTS = new Set(['Button', 'IconButton', 'ActionButton']);
const LENGTH_PROPS = new Set([
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'top', 'right', 'bottom', 'left', 'inset',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'marginInline', 'marginBlock',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'paddingInline', 'paddingBlock',
  'gap', 'rowGap', 'columnGap', 'fontSize', 'borderRadius', 'borderWidth', 'flexBasis', 'letterSpacing', 'outlineOffset',
]);
const LENGTH = /(^|[^\w.-])-?(\d+\.?\d*|\.\d+)(px|rem|em)\b/;

/** Class names defined by the selectors of a stylesheet (declaration values are never read). */
export function cssClasses(css) {
  const out = new Set();
  for (const rule of parseCss(css).rules) {
    if (rule.prelude.startsWith('@')) continue;
    const sel = rule.prelude.replace(/\[[^\]]*\]/g, ' ').replace(/"[^"]*"|'[^']*'/g, ' ');
    for (const m of sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.add(m[1]);
  }
  return out;
}

const unwrap = (n) => {
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isNonNullExpression(n))) n = n.expression;
  return n;
};
const propName = (p) => {
  const name = p.name;
  if (!name) return '';
  if (ts.isComputedPropertyName(name)) {
    const e = unwrap(name.expression);
    return e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : '';
  }
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : '';
};

/**
 * Lints one TSX file. `known` = the class names the file may use.
 * Returns { titles, unknown: [{ file, line, cls }], dynamic, literal } (each a list of `{ file, line, ... }`).
 */
export function lintTsx(file, text, known) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out = { titles: [], unknown: [], dynamic: [], literal: [] };
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const classes = (node) => {
    const n = unwrap(node);
    if (!n) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      for (const cls of n.text.split(/\s+/).filter(Boolean)) if (!known.has(cls)) out.unknown.push({ file, line: line(n), cls });
    } else if (ts.isTemplateExpression(n)) out.dynamic.push({ file, line: line(n), text: n.getText(sf) });
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) classes(n.right);
    else if (ts.isConditionalExpression(n)) {
      classes(n.whenTrue);
      classes(n.whenFalse);
    }
  };
  const isCx = (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'cx';
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const attr = node.name.text;
      const el = node.parent.parent;
      const tag = ts.isIdentifier(el.tagName) ? el.tagName.text : '';
      const init = node.initializer;
      if (attr === 'title' && tag && (/^[a-z]/.test(tag) || TITLE_COMPONENTS.has(tag))) out.titles.push({ file, line: line(node), tag });
      if (attr === 'className' && init) {
        if (ts.isStringLiteral(init)) classes(init);
        else if (ts.isJsxExpression(init) && init.expression && !isCx(unwrap(init.expression))) classes(init.expression);
      }
      if (attr === 'style' && init && ts.isJsxExpression(init)) {
        const obj = unwrap(init.expression);
        if (obj && ts.isObjectLiteralExpression(obj)) {
          for (const p of obj.properties) {
            if (!ts.isPropertyAssignment(p)) continue;
            const name = propName(p);
            if (name.startsWith('--')) continue;
            const v = unwrap(p.initializer);
            const str = ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v) ? v.text : null;
            const num = ts.isNumericLiteral(v) ? Number(v.text)
              : ts.isPrefixUnaryExpression(v) && ts.isNumericLiteral(v.operand) ? -Number(v.operand.text) : null;
            if ((str !== null && (hasColourLiteral(str) || LENGTH.test(str))) || (num !== null && num !== 0 && LENGTH_PROPS.has(name))) {
              out.literal.push({ file, line: line(p), text: p.getText(sf) });
            }
          }
        }
      }
    }
    if (isCx(node)) for (const a of node.arguments) classes(a);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** CSS rule violations of one design-system stylesheet, each as `file:line message`. */
export function lintCss(file, text) {
  const { css, rules } = parseCss(text);
  const out = [];
  const hoverMedia = (at) => at.some((a) => a.replace(/\s+/g, '').toLowerCase().includes('(hover:hover)and(pointer:fine)'));
  for (const rule of rules) {
    if (rule.prelude.includes(':hover') && !hoverMedia(rule.at)) out.push(`${file}:${lineAt(css, rule.offset)} :hover outside @media (hover: hover) and (pointer: fine): ${rule.prelude}`);
    for (const d of rule.decls) {
      const where = `${file}:${lineAt(css, d.offset)}`;
      if (hasColourLiteral(d.value)) out.push(`${where} colour literal: ${d.name}: ${d.value}`);
      if (LENGTH.test(d.value)) out.push(`${where} length literal: ${d.name}: ${d.value}`);
    }
  }
  return out;
}

function tsxFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.tsx') && !/\.test\.tsx$/.test(e.name))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

/** Lints the repository at `root`: { titles, unknown, dynamic, literal, css }. */
export function lintRepo(root = ROOT) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const has = (p) => existsSync(join(root, p));
  const classic = has(CLASSIC_CSS) ? cssClasses(read(CLASSIC_CSS)) : new Set();
  const ds = has(DS_CSS) ? cssClasses(read(DS_CSS)) : new Set();
  const both = new Set([...classic, ...ds]);
  const classicList = has(CLASSIC_LIST) ? new Set(JSON.parse(read(CLASSIC_LIST))) : null;
  const out = { titles: [], unknown: [], dynamic: [], literal: [], css: [] };
  for (const abs of tsxFiles(join(root, 'web'))) {
    const file = relative(root, abs).replaceAll('\\', '/');
    const known = !classicList || classicList.has(file) ? both : ds;
    const r = lintTsx(file, readFileSync(abs, 'utf8'), known);
    for (const k of ['titles', 'unknown', 'dynamic', 'literal']) out[k].push(...r[k]);
  }
  if (has(DS_CSS)) out.css = lintCss(DS_CSS, read(DS_CSS));
  return out;
}

/** Report lines and the verdict for the given maxima ({ maxTitle, maxUnknown, maxLiteral }, each 0 by default). */
export function runLint(max = {}, root = ROOT) {
  const r = lintRepo(root);
  const at = (x) => `  ${x.file}:${x.line}`;
  const lines = [
    ...r.titles.map((x) => `${at(x)} title on <${x.tag}>`),
    `native title: ${r.titles.length}`,
    ...r.unknown.map((x) => `${at(x)} ${x.cls}`),
    `unknown classes: ${r.unknown.length}`,
    `dynamic classes: ${r.dynamic.length} (not checked)`,
    ...r.literal.map((x) => `${at(x)} ${x.text}`),
    `literal styles: ${r.literal.length}`,
    ...r.css.map((x) => `  ${x}`),
    `css violations: ${r.css.length}`,
  ];
  const ok = r.css.length === 0 && r.titles.length <= (max.maxTitle ?? 0) && r.unknown.length <= (max.maxUnknown ?? 0) &&
    r.literal.length <= (max.maxLiteral ?? 0);
  return { lines, ok, counts: { title: r.titles.length, unknown: r.unknown.length, dynamic: r.dynamic.length, literal: r.literal.length, css: r.css.length } };
}

function main() {
  const { values } = parseArgs({ options: { 'max-title': { type: 'string' }, 'max-unknown': { type: 'string' }, 'max-literal': { type: 'string' } } });
  const n = (v) => (v === undefined ? 0 : Number(v));
  const r = runLint({ maxTitle: n(values['max-title']), maxUnknown: n(values['max-unknown']), maxLiteral: n(values['max-literal']) });
  console.log(r.lines.join('\n'));
  process.exit(r.ok ? 0 : 1);
}

if (import.meta.main) main();
