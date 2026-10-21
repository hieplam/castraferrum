// npm run uc-coverage [-- --min k]: the ratchet of this project (docs/ARCHITECTURE.md, "Testing").
// Counts the UC-xx of the spec that have at least one GREEN e2e test tagged @UC-xx, read from the Playwright JSON
// report (playwright.config.ts writes reports/e2e.json). Skipped, red and flaky tests do not count.
// Prints "UCs with a green e2e: k/N" + the list of missing ones; with --min k it exits 1 when below the floor k.
// Options: --report <json file> (default reports/e2e.json), --spec <md file> (repeatable; default docs/USE-CASES.md,
// the table of 32 use cases).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_SPECS = [join(ROOT, 'docs', 'USE-CASES.md')];
export const DEFAULT_REPORT = join(ROOT, 'reports', 'e2e.json');

/** The UC ids of the spec = the first cell of each row of the Use case table (`| UC-01 | ...`). */
export function readUcIds(specText) {
  return [...new Set([...specText.matchAll(/^\|\s*(UC-\d{2})\s*\|/gm)].map((m) => m[1]))].sort();
}

/** UC ids (without the @) tagged on the green e2e tests of the Playwright JSON report. */
export function greenUcIds(report) {
  const green = new Set();
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      if (!isGreen(spec)) continue;
      for (const tag of [...(spec.tags ?? []), ...(spec.title.match(/@UC-\d{2}/g) ?? [])]) {
        const id = tag.replace(/^@/, '');
        if (/^UC-\d{2}$/.test(id)) green.add(id);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return green;
}

/** Green = every project ran it and it passed on the first try (status `expected`, every run `passed`). */
function isGreen(spec) {
  return (
    spec.tests.length > 0 &&
    spec.tests.every((t) => t.status === 'expected' && t.results.length > 0 && t.results.every((r) => r.status === 'passed'))
  );
}

export function coverage(ucIds, green) {
  return {
    covered: ucIds.filter((id) => green.has(id)),
    missing: ucIds.filter((id) => !green.has(id)),
    unknown: [...green].filter((id) => !ucIds.includes(id)).sort(),
  };
}

/** @returns {number} exit code */
export function main(argv, log = console.log, error = console.error) {
  const { values } = parseArgs({
    args: argv,
    options: { min: { type: 'string' }, report: { type: 'string' }, spec: { type: 'string', multiple: true } },
  });
  const ucIds = readUcIds((values.spec ?? DEFAULT_SPECS).map((f) => readFileSync(f, 'utf8')).join('\n'));
  if (ucIds.length === 0) {
    error('Could not read any UC-xx id from the spec');
    return 2;
  }
  const reportPath = values.report ?? DEFAULT_REPORT;
  if (!existsSync(reportPath)) {
    error(`No e2e report yet (${reportPath}); run npm run test:e2e first`);
    return 2;
  }
  const { covered, missing, unknown } = coverage(ucIds, greenUcIds(JSON.parse(readFileSync(reportPath, 'utf8'))));
  log(`UCs with a green e2e: ${covered.length}/${ucIds.length}`);
  if (missing.length > 0) log(`Missing: ${missing.join(' ')}`);
  if (unknown.length > 0) log(`Tags not in the spec (not counted): ${unknown.join(' ')}`);
  if (values.min !== undefined) {
    const min = Number(values.min);
    if (!Number.isInteger(min) || min < 0) {
      error(`--min ${values.min} is not valid`);
      return 2;
    }
    if (covered.length < min) {
      error(`Below the ratchet floor: ${covered.length} < ${min}`);
      return 1;
    }
  }
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
