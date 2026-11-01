// node scripts/rule-lint.mjs [--root <dir>] [--base <git-ref> | --base-file <file>] [--count] [--write-baseline]
// Goal G16 of the goal-driven loop: a new rule line in a rule file must link to the check that enforces it.
//
// Rule files are the `files` of <root>/scripts/rule-lint-baseline.json (default CLAUDE.md and CONTRIBUTING.md).
// A block is a list item or a paragraph, its lines joined by a space. Headings, table rows and fenced code are no block.
// A rule line is a block that holds one of the words in RULE_WORDS. It has a check when it holds:
//   - an existing path under scripts/, tests/, .githooks/ or .github/, or
//   - `npm run <x>` where <x> is a script of <root>/package.json, or
//   - `No machine check:` followed by at least 4 words (an honest statement that no machine can check the rule).
// The baseline lists the rule lines that have no check today: {"v":1,"files":[],"unchecked":[{"file","id","preview"}]}.
// Failures (exit 1):
//   NEW <file>: <preview>  a rule line with no check that is not in the baseline
//   STALE <id>             a baseline entry that matches no unchecked rule line (remove it: the count fell)
//   GROWN <id>             with --base or --base-file: an entry that the base baseline does not hold
// Exit 2: a rule file or the baseline is missing, or --write-baseline would overwrite a baseline.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_FILES = ['CLAUDE.md', 'CONTRIBUTING.md'];
const BASELINE = 'scripts/rule-lint-baseline.json';
const RULE_WORDS = /\b(must|never|always|do not|don't|non-negotiable|may only|may not|is forbidden)\b/i;
const PATH_REF = /(?<![\w./-])(?:scripts|tests|\.githooks|\.github)\/[\w./@-]*/g;

/** The blocks of a markdown text: list items and paragraphs, with their lines joined by a space. */
export function blocks(text) {
  const out = [];
  let cur = null;
  let fence = false;
  const flush = () => {
    if (cur) out.push(cur.join(' ').replace(/\s+/g, ' ').trim());
    cur = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) {
      flush();
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (!raw.trim() || /^\s*#{1,6}\s/.test(raw) || /^\s*\|/.test(raw) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) {
      flush();
      continue;
    }
    const item = raw.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      flush();
      cur = [item[1]];
    } else if (cur) cur.push(raw.trim().replace(/^>\s*/, ''));
    else cur = [raw.trim().replace(/^>\s*/, '')];
  }
  flush();
  return out;
}

export const isRuleLine = (block) => RULE_WORDS.test(block);

/** True when the block links to a check that exists in `root` (see the header). */
export function hasCheck(block, root, scripts) {
  for (const m of block.matchAll(PATH_REF)) {
    const path = m[0].replace(/[.,;:)]+$/, '').replace(/\/$/, '');
    if (path.includes('/') && existsSync(join(root, path))) return true;
  }
  for (const m of block.matchAll(/\bnpm run ([\w:.-]+)/g)) if (scripts.has(m[1])) return true;
  const none = block.match(/No machine check:\s*(.*)$/);
  return !!none && none[1].split(/\s+/).filter(Boolean).length >= 4;
}

const idOf = (file, block) => createHash('sha256').update(`${file}\n${block}`).digest('hex').slice(0, 12);

/** Reads the rule files of `root`. Throws an error with `missing: true` when one is absent. */
export function scan(root, files) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const scripts = new Set(Object.keys(pkg.scripts ?? {}));
  let rules = 0;
  const unchecked = [];
  for (const file of files) {
    const abs = join(root, file);
    if (!existsSync(abs)) throw Object.assign(new Error(`rule file missing: ${file}`), { missing: true });
    for (const block of blocks(readFileSync(abs, 'utf8'))) {
      if (!isRuleLine(block)) continue;
      rules += 1;
      if (!hasCheck(block, root, scripts)) unchecked.push({ file, id: idOf(file, block), preview: block.slice(0, 80) });
    }
  }
  return { rules, unchecked };
}

/** Failure lines for the unchecked rule lines against the baseline and, when given, the base baseline. */
export function compare(unchecked, baseline, base) {
  const failures = [];
  const known = new Set(baseline.unchecked.map((e) => e.id));
  for (const u of unchecked) if (!known.has(u.id)) failures.push(`NEW ${u.file}: ${u.preview}`);
  const live = new Set(unchecked.map((u) => u.id));
  for (const e of baseline.unchecked) if (!live.has(e.id)) failures.push(`STALE ${e.id}`);
  if (base) {
    const old = new Set(base.unchecked.map((e) => e.id));
    for (const e of baseline.unchecked) if (!old.has(e.id)) failures.push(`GROWN ${e.id}`);
  }
  return failures;
}

function fail(code, msg) {
  console.error(`rule-lint: ${msg}`);
  process.exit(code);
}

function readBase(values, root) {
  if (values['base-file']) {
    if (!existsSync(values['base-file'])) fail(2, `base file missing: ${values['base-file']}`);
    return JSON.parse(readFileSync(values['base-file'], 'utf8'));
  }
  if (values.base) {
    try {
      const out = execFileSync('git', ['show', `${values.base}:./${BASELINE}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return JSON.parse(out);
    } catch {
      console.log(`base ${values.base}: no ${BASELINE} there, growth not checked`);
    }
  }
  return null;
}

function main() {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      base: { type: 'string' },
      'base-file': { type: 'string' },
      count: { type: 'boolean' },
      'write-baseline': { type: 'boolean' },
    },
  });
  const root = values.root ? resolve(values.root) : DEFAULT_ROOT;
  const baselinePath = join(root, BASELINE);
  const haveBaseline = existsSync(baselinePath);
  const baseline = haveBaseline ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
  if (baseline && baseline.v !== 1) fail(2, `unknown baseline version: ${baseline.v}`);
  const files = baseline?.files?.length ? baseline.files : DEFAULT_FILES;
  let found;
  try {
    found = scan(root, files);
  } catch (e) {
    if (e.missing) fail(2, e.message);
    throw e;
  }
  if (values['write-baseline']) {
    if (haveBaseline) fail(2, `${BASELINE} exists; edit it by hand (it may only shrink)`);
    writeFileSync(baselinePath, `${JSON.stringify({ v: 1, files, unchecked: found.unchecked }, null, 2)}\n`);
    console.log(`rule-lint: wrote ${BASELINE} (rule lines ${found.rules}, without a check ${found.unchecked.length})`);
    return;
  }
  if (values.count) {
    console.log(`rule lines: ${found.rules}`);
    console.log(`without a check: ${found.unchecked.length}`);
    return;
  }
  if (!baseline) fail(2, `${BASELINE} is missing; run with --write-baseline`);
  const failures = compare(found.unchecked, baseline, readBase(values, root));
  const summary = `rule lines ${found.rules}, without a check ${found.unchecked.length}, new ${failures.filter((f) => f.startsWith('NEW')).length}`;
  for (const f of failures) console.log(f);
  console.log(failures.length ? `rule-lint: failed (${summary})` : `rule-lint: ok (${summary})`);
  process.exit(failures.length ? 1 : 0);
}

if (import.meta.main) main();
