// The design-system catalogue against the spec (UI uplift, task U3): every backticked class in the component table of
// spec 4.5 is a class selector of design/ds/components.css with at least one declaration, and appears on the
// design-system page design/ds/index.html.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCss } from '../../scripts/design-tokens.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : '');
const SPEC = read('docs/specs/2026-10-21-ui-uplift.md');
const CSS = 'design/ds/components.css';
const PAGE = 'design/ds/index.html';

/** The body of a spec section, from its heading to the next heading of level 3 or less. */
function section(heading: string): string {
  const start = SPEC.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`spec heading not found: ${heading}`);
  const rest = SPEC.slice(start + heading.length + 2);
  const end = rest.search(/\n#{1,3} /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Every class named inside backticks in the table rows of spec 4.5 (the header and separator rows skipped). */
function specClasses(): string[] {
  const rows = section('### 4.5 Components').split('\n').filter((l) => l.startsWith('|') && !/^\|\s*(Component|-)/.test(l));
  const out = new Set<string>();
  for (const row of rows) {
    for (const tick of row.matchAll(/`([^`]+)`/g)) for (const m of tick[1]!.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.add(m[1]!);
  }
  return [...out];
}

type Rule = { prelude: string; decls: { name: string; value: string }[] };

/** The class names of a selector list, attribute and string contents removed. */
const selectorClasses = (prelude: string) =>
  new Set([...prelude.replace(/\[[^\]]*\]/g, ' ').replace(/"[^"]*"|'[^']*'/g, ' ').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]!));

/** The class names used by the `class` attributes of an HTML page. */
const pageClasses = (html: string) =>
  new Set([...html.matchAll(/\bclass="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/).filter(Boolean)));

describe('design/ds components against spec 4.5', () => {
  const classes = specClasses();
  const rules = (parseCss(read(CSS)).rules as Rule[]).filter((r) => !r.prelude.startsWith('@'));
  const page = pageClasses(read(PAGE));

  it('the table of spec 4.5 names the classes', () => {
    console.log(`spec 4.5 classes: ${classes.length}`);
    expect(classes.length).toBeGreaterThan(150);
    expect(classes).toContain('btn');
    expect(classes).toContain('picker-target');
  });

  it('every class is a selector of components.css', () => {
    const missing = classes.filter((c) => !rules.some((r) => selectorClasses(r.prelude).has(c)));
    console.log(`catalogue coverage: ${classes.length - missing.length}/${classes.length}`);
    expect(missing, `${CSS}: classes with no selector`).toEqual([]);
  });

  it('every class has a rule with at least one declaration', () => {
    const empty = classes.filter((c) => !rules.some((r) => selectorClasses(r.prelude).has(c) && r.decls.length > 0));
    expect(empty, `${CSS}: classes whose rules declare nothing`).toEqual([]);
  });

  it('every class appears on the design-system page', () => {
    const absent = classes.filter((c) => !page.has(c));
    expect(absent, `${PAGE}: classes not shown`).toEqual([]);
  });
});
