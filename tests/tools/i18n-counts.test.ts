// A count of one reads as singular (spec D16, castraferrum#185): every message the app or the design preview names that
// counts with an English plural noun (`{n} lines`) is the `.other` form of a plural key, read with `tn()`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en, type MessageKey } from '../../shared/i18n/en';

// Every key the two UIs name literally in their code (comments left out): the app (web/, not its tests) and the design preview.
const withoutComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function keysTheUiNames(): Set<string> {
  const root = join(import.meta.dirname, '..', '..');
  const files = readdirSync(join(root, 'web'), { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(root, 'web', f))
    .concat(join(root, 'design', 'ds', 'preview', 'preview.js'));
  const names = new Set<string>();
  for (const f of files) for (const m of withoutComments(readFileSync(f, 'utf8')).matchAll(/'([\w.]+)'/g)) names.add(m[1]!);
  return names;
}

/** `{n}` followed by an English plural noun (`{n} lines`, `{n} more runs`), not a run number like `#{n} has`. */
const COUNTS_PLURAL = /(?<!#)\{n\}[ \u00a0](?:more[ \u00a0])?[a-z]+s\b/;
/** Keys whose count is never 1, so they need no singular form. */
const NEVER_ONE: Record<string, string> = { 'folder.truncated': 'n is the folder cap of the server, never 1' };

describe('counts (spec D16)', () => {
  it('gives every count the UI shows a singular form: never "1 lines"', () => {
    const named = keysTheUiNames();
    const missing = (Object.keys(en) as MessageKey[]).filter(
      (k) => named.has(k) && !k.endsWith('.other') && !(k in NEVER_ONE) && COUNTS_PLURAL.test(en[k]),
    );
    expect(missing).toEqual([]);
  });
});
