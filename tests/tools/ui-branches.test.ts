// The UI helpers of the e2e tests (UI uplift, task U12): tests/support/ui.ts holds one helper per step that differs
// between the classic and the new UI (spec 7.2). A helper that has a new-UI branch (an `isNewUi` condition) must check
// at least as much there as its classic branch does, so a new branch cannot pass by asserting nothing. Helpers without a
// new branch yet are counted; the screen tasks U14 to U19 bring that count down.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HELPERS = [
  'revealRowActions',
  'runHistory',
  'executionRows',
  'loopRowOnList',
  'switchLanguage',
  'themeName',
  'lampState',
  'statValue',
  'pickScheduleKind',
  'registerRepo',
  'openFolderPicker',
  'deleteRepo',
];

interface Helper {
  name: string;
  /** One entry per `isNewUi` condition: the expect calls of its new and its classic branch. */
  branches: { line: number; fresh: number; classic: number }[];
}

function expects(node: ts.Node | undefined): number {
  let n = 0;
  const visit = (x: ts.Node) => {
    if (ts.isCallExpression(x)) {
      const callee = x.expression;
      if (ts.isIdentifier(callee) && callee.text === 'expect') n++;
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'expect') n++;
    }
    ts.forEachChild(x, visit);
  };
  if (node) visit(node);
  return n;
}

const mentionsIsNewUi = (node: ts.Node): boolean =>
  (ts.isIdentifier(node) && node.text === 'isNewUi') || (ts.forEachChild(node, mentionsIsNewUi) ?? false);

/** The exported helpers of a ui.ts source and their new-UI branches. */
function helpers(text: string): Helper[] {
  const source = ts.createSourceFile('ui.ts', text, ts.ScriptTarget.Latest, true);
  const out: Helper[] = [];
  for (const st of source.statements) {
    if (!ts.isFunctionDeclaration(st) || !st.name || !st.body) continue;
    if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || st.name.text === 'isNewUi') continue;
    const helper: Helper = { name: st.name.text, branches: [] };
    const statements = st.body.statements;
    const visit = (node: ts.Node) => {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if (ts.isIfStatement(node) && mentionsIsNewUi(node.expression)) {
        // `if (await isNewUi(page)) { ... return } classic` keeps the classic branch after the if.
        const index = statements.indexOf(node);
        const after = index >= 0 ? statements.slice(index + 1) : [];
        const classic = node.elseStatement ? expects(node.elseStatement) : after.reduce((n, s) => n + expects(s), 0);
        helper.branches.push({ line, fresh: expects(node.thenStatement), classic });
      } else if (ts.isConditionalExpression(node) && mentionsIsNewUi(node.condition)) {
        helper.branches.push({ line, fresh: expects(node.whenTrue), classic: expects(node.whenFalse) });
      }
      ts.forEachChild(node, visit);
    };
    visit(st.body);
    out.push(helper);
  }
  return out;
}

/** The problems of a helper's new-UI branches. */
function weakBranches(list: Helper[]): string[] {
  return list.flatMap((h) =>
    h.branches
      .filter((b) => b.fresh < b.classic || (b.classic > 0 && b.fresh < 1))
      .map((b) => `${h.name} (line ${b.line}): new branch has ${b.fresh} expect calls, classic has ${b.classic}`),
  );
}

describe('ui helpers', () => {
  it('flags a new branch that checks less than the classic one', () => {
    const src = `
      export async function isNewUi(page) { return false; }
      export async function a(page) { if (await isNewUi(page)) { return 1; } expect(x).toBe(1); }
      export async function b(page) { if (await isNewUi(page)) { expect(y).toBe(1); return; } expect(x).toBe(1); }
      export async function c(page) { return (await isNewUi(page)) ? 1 : expect.poll(f).toBe(1); }
      export async function d(page) { return page.getByTestId('x'); }`;
    const list = helpers(src);
    expect(list.map((h) => h.name)).toEqual(['a', 'b', 'c', 'd']);
    expect(weakBranches(list)).toEqual([
      'a (line 3): new branch has 0 expect calls, classic has 1',
      'c (line 5): new branch has 0 expect calls, classic has 1',
    ]);
    expect(list.filter((h) => h.branches.length === 0).map((h) => h.name)).toEqual(['d']);
  });

  it('tests/support/ui.ts holds every helper, and every new branch checks at least as much as the classic one', () => {
    const list = helpers(readFileSync(join(ROOT, 'tests/support/ui.ts'), 'utf8'));
    expect(list.map((h) => h.name)).toEqual(expect.arrayContaining(HELPERS));
    expect(weakBranches(list)).toEqual([]);
    const without = list.filter((h) => h.branches.length === 0);
    console.log(`helpers without a new branch: ${without.length}`);
  });
});
