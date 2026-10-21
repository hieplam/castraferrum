// npm run ratchets [-- --base <git-ref>]
// Runs every limit of scripts/ratchets.json (UI uplift, task U0):
//   - tokens: one scripts/design-tokens.mjs check per entry (an entry `{ file, removedBy }` is a tombstone, skipped);
//   - lint: scripts/design-lint.mjs with the maxima of `lint`;
//   - e2e expects: the `expect(`, `expect.soft(` and `expect.poll(` calls of tests/e2e and tests/support, at least
//     `e2eExpectsMin`.
// With --base, the same JSON at that ref (when it exists there) is the reference: a maximum may only go down, a minimum
// only up, and an entry only disappears through a tombstone. A lowered `e2eExpectsMin` passes only with the note
// `e2eExpectsLoweredBy: { task, from, classicBranchExpects }` where `from` is the base value and the new value is
// `from - classicBranchExpects`. Prints each check's lines, then `ratchets: ok` (exit 0) or `ratchets: failed` (exit 1).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runLint } from './design-lint.mjs';
import { runTokens } from './design-tokens.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG = 'scripts/ratchets.json';
const EXPECT_DIRS = ['tests/e2e', 'tests/support'];

/** Limits that `cur` loosened compared with `base`, one message each (empty = the ratchet held). */
export function compareRatchets(base, cur) {
  const errors = [];
  const limits = (where, b, c) => {
    for (const [k, bv] of Object.entries(b)) {
      const isMax = /^max/.test(k);
      const isMin = /^min/.test(k);
      if (!isMax && !isMin) continue;
      const cv = c[k];
      if (cv === undefined) errors.push(`${where}.${k}: removed (base ${bv})`);
      else if (isMax && cv > bv) errors.push(`${where}.${k}: raised ${bv} -> ${cv}`);
      else if (isMin && cv < bv) errors.push(`${where}.${k}: lowered ${bv} -> ${cv}`);
    }
  };
  for (const b of base.tokens ?? []) {
    if (b.removedBy) continue;
    const c = (cur.tokens ?? []).find((e) => e.file === b.file);
    if (!c) errors.push(`tokens ${b.file}: entry removed without a tombstone ({ "file", "removedBy" })`);
    else if (!c.removedBy) limits(`tokens ${b.file}`, b, c);
  }
  if (base.lint) {
    if (!cur.lint) errors.push('lint: section removed');
    else limits('lint', base.lint, cur.lint);
  }
  if (base.e2eExpectsMin !== undefined) {
    const b = base.e2eExpectsMin;
    const c = cur.e2eExpectsMin;
    const note = cur.e2eExpectsLoweredBy;
    if (c === undefined) errors.push(`e2eExpectsMin: removed (base ${b})`);
    else if (c < b && !(note && note.from === b && c === note.from - note.classicBranchExpects)) {
      errors.push(`e2eExpectsMin: lowered ${b} -> ${c} without a matching e2eExpectsLoweredBy note`);
    }
  }
  return errors;
}

/** Number of expect calls in the e2e tests and their support files. */
export function countE2eExpects(root = ROOT) {
  let n = 0;
  for (const dir of EXPECT_DIRS) {
    const abs = join(root, dir);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true, recursive: true })) {
      if (!e.isFile() || !e.name.endsWith('.ts')) continue;
      n += readFileSync(join(e.parentPath, e.name), 'utf8').match(/\bexpect(?:\.soft|\.poll)?\(/g)?.length ?? 0;
    }
  }
  return n;
}

function baseConfig(ref) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${ref}:${CONFIG}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

function main() {
  const { values } = parseArgs({ options: { base: { type: 'string' } } });
  const config = JSON.parse(readFileSync(join(ROOT, CONFIG), 'utf8'));
  let ok = true;
  const at = (p) => (p ? join(ROOT, p) : undefined);
  for (const t of config.tokens ?? []) {
    if (t.removedBy) {
      console.log(`${t.file}: removed by ${t.removedBy}`);
      continue;
    }
    const r = runTokens(at(t.file), { ...t, pairs: at(t.pairs), require: at(t.require) });
    r.lines[0] = t.file;
    console.log(r.lines.join('\n'));
    ok &&= r.ok;
  }
  if (config.lint) {
    const r = runLint(config.lint);
    console.log(r.lines.join('\n'));
    ok &&= r.ok;
  }
  const expects = countE2eExpects();
  console.log(`e2e expects: ${expects} (min ${config.e2eExpectsMin ?? 0})`);
  ok &&= expects >= (config.e2eExpectsMin ?? 0);
  if (values.base) {
    const base = baseConfig(values.base);
    if (!base) console.log(`base ${values.base}: no ${CONFIG} there, nothing to compare`);
    else {
      const errors = compareRatchets(base, config);
      for (const e of errors) console.log(`base ${values.base}: ${e}`);
      if (!errors.length) console.log(`base ${values.base}: every limit held`);
      ok &&= errors.length === 0;
    }
  }
  console.log(ok ? 'ratchets: ok' : 'ratchets: failed');
  process.exit(ok ? 0 : 1);
}

if (import.meta.main) main();
