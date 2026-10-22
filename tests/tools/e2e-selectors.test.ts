// The e2e tests select by test id or attribute, never by a classic CSS class (UI uplift, task U12): the same tests
// must drive the new UI, whose classes differ. This scan reads the string literals of tests/e2e and tests/support
// (except tests/support/ui.ts, whose classic branches keep their selectors until the cut-over) and flags a class token,
// an XPath selector and any toHaveClass call. Toasts keep their classes in both systems (spec 7.1). The file and folder
// names the tests create or read (`.claude`, `.git`, `.jsonl`, ...) look like class tokens and are not selectors.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLASS_TOKEN = /(^|[\s>+~,(\]])\.[A-Za-z][\w-]*/g;
const ALLOWED = new Set(['.toast', '.toast.is-err']);
const FILE_NAMES = new Set(['.an', '.claude', '.git', '.jsonl', '.png']);
const EXEMPT = new Set(['tests/support/ui.ts']);

function files(): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, 'tests/e2e'), { recursive: true, withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.ts')) out.push(join(e.parentPath, e.name));
  }
  for (const e of readdirSync(join(ROOT, 'tests/support'), { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.ts')) out.push(join(e.parentPath, e.name));
  }
  return out.map((f) => relative(ROOT, f).replaceAll('\\', '/')).filter((f) => !EXEMPT.has(f)).sort();
}

/** Every flagged place of one file, as `file:line reason`. */
function scan(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const at = (node: ts.Node, why: string) =>
    found.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1} ${why}`);
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const s = node.text;
      if (!ALLOWED.has(s.trim())) {
        const token = [...s.matchAll(CLASS_TOKEN)].map((m) => m[0].slice((m[1] ?? '').length)).find((t) => !FILE_NAMES.has(t));
        if (token) at(node, `class token ${token} in ${JSON.stringify(s)}`);
      }
      if (s.includes('xpath=')) at(node, `xpath in ${JSON.stringify(s)}`);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'toHaveClass') {
      at(node, 'toHaveClass(');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('e2e selectors', () => {
  it('flags a class token, an xpath and toHaveClass, and allows the toasts', () => {
    const src = [
      `page.locator('.row-name .nm');`,
      `page.locator('[data-testid=repo-row] .repo-tag');`,
      'page.locator(`.st.${status}`);',
      `page.getByTestId('f-repo').locator('xpath=../..');`,
      `await expect(row).toHaveClass(/is-sel/);`,
      `page.locator('.toast'); page.locator('.toast.is-err');`,
      `page.getByTestId('loop-name'); page.locator('[data-seq]'); page.getByText('Saved. Next run 8:00');`,
      `join(home, '.claude', 'projects', id + '.jsonl'); test('reads the .jsonl file');`,
    ].join('\n');
    expect(scan('x.ts', src)).toEqual([
      'x.ts:1 class token .row-name in ".row-name .nm"',
      'x.ts:2 class token .repo-tag in "[data-testid=repo-row] .repo-tag"',
      'x.ts:3 class token .st in ".st."',
      'x.ts:4 xpath in "xpath=../.."',
      'x.ts:5 toHaveClass(',
    ]);
  });

  it('no e2e test or support file selects by class or XPath', () => {
    const found = files().flatMap((f) => scan(f, readFileSync(join(ROOT, f), 'utf8')));
    console.log(`class and xpath selectors in tests: ${found.length}`);
    expect(found).toEqual([]);
  });
});
