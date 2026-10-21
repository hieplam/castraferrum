// Core of `npm run arch` (scripts/arch-check.mjs) and of tests/tools/arch-fixtures.test.ts:
// runs the layer rules (.dependency-cruiser.cjs + the network rule) on the real code and on tests/arch-fixtures/.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cruise } from 'dependency-cruiser';
import extractDepcruiseOptions from 'dependency-cruiser/config-utl/extract-depcruise-options';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const FIXTURES = join(ROOT, 'tests', 'arch-fixtures');
const CONFIG = join(ROOT, '.dependency-cruiser.cjs');
const SOURCE_DIRS = ['server', 'shared', 'web', 'tests'];

/** A rule imports cannot express: only web/api/ may call the network (fetch, EventSource, WebSocket, XHR). */
export const NETWORK_RULE = 'web-only-api-calls-network';
const NETWORK_CALL = /\bfetch\s*\(|\bnew\s+(EventSource|WebSocket|XMLHttpRequest)\b/;

/** @typedef {{ rule: string, from: string, to?: string }} Violation */

/** Names of all rules: the `forbidden` rules of dependency-cruiser + the network rule. */
export function ruleNames() {
  const config = createRequire(import.meta.url)(CONFIG);
  return [...config.forbidden.map((/** @type {{ name: string }} */ r) => r.name), NETWORK_RULE];
}

/**
 * Runs dependency-cruiser with the project config, rooted at `baseDir` (real code: ROOT; fixtures: FIXTURES).
 * @returns {Promise<Violation[]>}
 */
export async function depcruise(baseDir, dirs) {
  const options = await extractDepcruiseOptions(CONFIG);
  const { output } = await cruise(dirs, { ...options, baseDir });
  if (typeof output === 'string') throw new Error('dependency-cruiser returned a string instead of a JSON result');
  return output.summary.violations.map((v) => ({ rule: v.rule.name, from: v.from, to: v.to }));
}

/** @returns {Violation[]} files outside web/api/ that call the network (comments and *.test.* files are ignored). */
export function scanNetworkCalls(baseDir) {
  /** @type {Violation[]} */
  const found = [];
  for (const file of listFiles(join(baseDir, 'web'))) {
    const rel = relative(baseDir, file).split(sep).join('/');
    if (!/\.tsx?$/.test(rel) || /\.test\.tsx?$/.test(rel) || rel.startsWith('web/api/')) continue;
    if (NETWORK_CALL.test(stripComments(readFileSync(file, 'utf8')))) found.push({ rule: NETWORK_RULE, from: rel });
  }
  return found;
}

/** Violations in the real code (must always be empty). */
export async function checkSources() {
  const dirs = SOURCE_DIRS.filter((d) => listFiles(join(ROOT, d)).length > 0);
  return { depcruise: await depcruise(ROOT, dirs), network: scanNetworkCalls(ROOT) };
}

/**
 * Matches the violations caught in tests/arch-fixtures/ against the `// violates: <rule>` line of each file.
 * Passes when every declared violation is caught, none is unexpected, and every rule has at least one violating file.
 */
export async function checkFixtures() {
  const actual = [...(await depcruise(FIXTURES, ['server', 'shared', 'web'])), ...scanNetworkCalls(FIXTURES)];
  const expected = declaredViolations();
  const remaining = actual.map(key);
  const caught = [];
  const missing = [];
  for (const e of expected.map(key)) {
    const i = remaining.indexOf(e);
    if (i === -1) missing.push(e);
    else caught.push(...remaining.splice(i, 1));
  }
  const rulesWithoutFixture = ruleNames().filter((name) => !expected.some((e) => e.rule === name));
  return { expected: expected.length, caught: caught.length, missing, unexpected: remaining, rulesWithoutFixture };
}

/** @returns {Violation[]} */
function declaredViolations() {
  /** @type {Violation[]} */
  const declared = [];
  for (const file of listFiles(FIXTURES)) {
    const from = relative(FIXTURES, file).split(sep).join('/');
    for (const m of readFileSync(file, 'utf8').matchAll(/^\/\/ violates: ([\w-]+)$/gm)) declared.push({ rule: m[1], from });
  }
  return declared;
}

/** @param {Violation} v */
const key = (v) => `${v.rule} ← ${v.from}`;

/** @returns {string[]} */
function listFiles(dir) {
  try {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => join(d.parentPath, d.name));
  } catch {
    return [];
  }
}

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
