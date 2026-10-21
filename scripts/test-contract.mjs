// npm run test:contract: runs the Vitest project `contract`, then prints the number of cases per side:
//   memory: N passed · postgres: N passed
//   executor contract — mock: M passed · claude (fake query): M passed [· claude (real): M passed]
// tests/contract/repositories.contract.ts runs on both the in-memory fake (memory.test.ts) and Postgres
// (postgres.test.ts); the point is to prove that both behave identically, so both sides must have the SAME set of
// cases and all be green. tests/contract/executor.contract.ts runs on each executor (describe 'executor contract' >
// <kind>: mock, claude (fake query), claude (real) when LC_REAL_CLAUDE=1), so every executor has the same cases and is
// green.
// Exit 1 when: Vitest is red, a case is red or skipped, a side has no cases, the two sides (or two executors) differ in
// their set of cases, or an unfiltered run misses one of the two suites entirely. Extra arguments go straight to
// Vitest (filtering by file, e.g. `-- executor`, means the filtered-out suite is not demanded; filtering with -t makes
// the filtered cases count as skipped, so exit 1). The JSON is written to reports/contract.json.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SIDES = ['memory', 'postgres'];
export const EXECUTOR_ROOT = 'executor contract';

const blank = () => ({ passed: 0, failed: 0, skipped: 0, titles: new Set() });

/** Every group (side / executor) must be fully green with no skips; groups of one suite must have the same cases. */
function check(names, by, problems) {
  const parts = names.map((s) => {
    const b = by[s];
    if (b.failed) problems.push(`${s}: ${b.failed} failed case(s)`);
    if (b.skipped) problems.push(`${s}: ${b.skipped} skipped case(s)`);
    const extra = [b.failed && `${b.failed} failed`, b.skipped && `${b.skipped} skipped`].filter(Boolean);
    return `${s}: ${b.passed} passed${extra.length ? `, ${extra.join(', ')}` : ''}`;
  });
  const [first, ...rest] = names;
  for (const s of rest) {
    const only = (a, b) => [...by[a].titles].filter((t) => !by[b].titles.has(t));
    for (const t of only(first, s)) problems.push(`only ${first} has: ${t}`);
    for (const t of only(s, first)) problems.push(`only ${s} has: ${t}`);
  }
  return parts;
}

/**
 * Groups the Vitest JSON report by the outermost describe (`memory` / `postgres` / `executor contract` > <kind>).
 * `requireAll` = unfiltered run: a repository suite or executor suite that is missing entirely is also an error.
 * @returns {{ line: string, lines: string[], ok: boolean, problems: string[] }}
 */
export function summarize(report, { sides = SIDES, requireAll = false } = {}) {
  const by = Object.fromEntries(sides.map((s) => [s, blank()]));
  const executors = {};
  let total = 0;
  for (const file of report.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      total++;
      const [root, kind] = t.ancestorTitles ?? [];
      let group;
      let path;
      if (root === EXECUTOR_ROOT && kind) {
        group = executors[kind] ??= blank();
        path = t.ancestorTitles.slice(2);
      } else {
        group = by[root];
        path = (t.ancestorTitles ?? []).slice(1);
      }
      if (!group) continue;
      if (t.status === 'passed') group.passed++;
      else if (t.status === 'failed') group.failed++;
      else group.skipped++;
      group.titles.add([...path, t.title].join(' › '));
    }
  }
  const problems = [];
  if (total === 0) problems.push('no contract cases');
  // Filtering by file (e.g. `npm run test:contract -- executor`) can drop the repository suite entirely, and then
  // neither side is demanded; if one side has cases, the other must have them too.
  const reposAbsent = total > 0 && sides.every((s) => by[s].titles.size === 0);
  if (!reposAbsent || requireAll) {
    for (const s of sides) if (by[s].titles.size === 0) problems.push(`${s}: no cases`);
  }
  const lines = reposAbsent && !requireAll ? [] : [check(sides, by, problems).join(' · ')];
  const kinds = Object.keys(executors);
  if (kinds.length > 0) lines.push(`${EXECUTOR_ROOT} — ${check(kinds, executors, problems).join(' · ')}`);
  else if (requireAll) problems.push(`${EXECUTOR_ROOT}: no cases`);
  return { line: lines.join('\n'), lines, ok: problems.length === 0, problems };
}

function main(extraArgs) {
  const out = join(ROOT, 'reports', 'contract.json');
  rmSync(out, { force: true });
  const vitest = spawnSync(
    process.execPath,
    [
      join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      '--project',
      'contract',
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${out}`,
      ...extraArgs,
    ],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (!existsSync(out)) {
    console.error('test:contract: Vitest did not write reports/contract.json');
    return 1;
  }
  const { line, ok, problems } = summarize(JSON.parse(readFileSync(out, 'utf8')), { requireAll: extraArgs.length === 0 });
  console.log(`\n${line}`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  return vitest.status === 0 && ok ? 0 : 1;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
