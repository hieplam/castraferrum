// The written rules of the design system (UI uplift, task U4): design/ds/SYSTEM.md has a section for each part the
// plan names, a subsection for every component family of spec 4.5, names the label `design-system`, and documents
// every token of design/ds/required-tokens.json.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : '');
const SPEC = read('docs/specs/2026-10-21-ui-uplift.md');
const DOC_PATH = 'design/ds/SYSTEM.md';
const DOC = read(DOC_PATH);
const TOKENS: string[] = JSON.parse(read('design/ds/required-tokens.json') || '[]');

const SECTIONS = [
  'Principles',
  'Tokens',
  'Type',
  'Colour and contrast',
  'Interaction states',
  'Components',
  'Layout',
  'Content',
  'Accessibility',
  'iOS',
  'Test ids',
  'How to change the system',
  'The checklist for every UI pull request',
];

/** The body of a spec section, from its heading to the next heading of level 3 or less. */
function section(heading: string): string {
  const start = SPEC.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`spec heading not found: ${heading}`);
  const rest = SPEC.slice(start + heading.length + 2);
  const end = rest.search(/\n#{1,3} /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The first cell of every table row of spec 4.5 (the header and separator rows skipped): the component families. */
function specFamilies(): string[] {
  return section('### 4.5 Components')
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*(Component|-)/.test(l))
    .map((l) => l.split('|')[1]!.trim());
}

/** The heading texts of SYSTEM.md at one level. */
const headings = (level: number) =>
  new Set([...DOC.matchAll(new RegExp(`^${'#'.repeat(level)} (.+)$`, 'gm'))].map((m) => m[1]!.trim()));

/** Whether the document names a token as a whole word (`--space-1` is not found inside `--space-10`). */
const mentions = (token: string) => new RegExp(`${token.replace(/[-]/g, '\\-')}(?![\\w-])`).test(DOC);

describe('design/ds/SYSTEM.md', () => {
  it('exists', () => {
    expect(DOC.length, `${DOC_PATH} is missing or empty`).toBeGreaterThan(0);
  });

  it('has a section for each part of the plan', () => {
    const h2 = headings(2);
    const missing = SECTIONS.filter((s) => !h2.has(s));
    console.log(`sections: ${SECTIONS.length - missing.length}/${SECTIONS.length}`);
    expect(missing, `${DOC_PATH}: missing sections`).toEqual([]);
  });

  it('has a subsection for every component family of spec 4.5', () => {
    const families = specFamilies();
    expect(families.length).toBeGreaterThanOrEqual(19);
    expect(families).toContain('Folder picker');
    const h3 = headings(3);
    const missing = families.filter((f) => !h3.has(f));
    console.log(`component families: ${families.length - missing.length}/${families.length}`);
    expect(missing, `${DOC_PATH}: missing component families`).toEqual([]);
  });

  it('names the label design-system', () => {
    expect(DOC).toContain('`design-system`');
  });

  it('documents every required token', () => {
    expect(TOKENS.length).toBeGreaterThan(140);
    const missing = TOKENS.filter((t) => !mentions(t));
    console.log(`documented tokens: ${TOKENS.length - missing.length}/${TOKENS.length}`);
    expect(missing, `${DOC_PATH}: tokens not documented`).toEqual([]);
  });
});
