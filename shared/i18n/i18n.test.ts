// i18n keys en <-> vi (UC-18 "no text lacks a translation"): the same key set, no empty string, the same `{x}` parameters.
// The key set comes from en.ts (`MessageKey`); vi.ts is `Record<MessageKey, string>`, so the typecheck already catches a
// missing key. This test also catches an extra key, an empty string and a parameter mismatch (for example `{n}` in en
// that vi forgot: the Vietnamese UI would show no number).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en, type MessageKey } from './en';
import { vi } from './vi';

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n key sets en <-> vi', () => {
  it('has one key set', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty string', () => {
    for (const [lang, msgs] of [['en', en], ['vi', vi]] as const) {
      const empty = Object.entries(msgs).filter(([, v]) => v.trim() === '').map(([k]) => k);
      expect(empty, `${lang} has empty strings`).toEqual([]);
    }
  });

  it('gives every key the same {x} parameters in both languages', () => {
    const mismatched = (Object.keys(en) as MessageKey[])
      .filter((k) => JSON.stringify(params(en[k])) !== JSON.stringify(params(vi[k] ?? '')))
      .map((k) => `${k}: en ${params(en[k]).join(',')} != vi ${params(vi[k] ?? '').join(',')}`);
    expect(mismatched).toEqual([]);
  });
});

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

describe('counts (spec D16, castraferrum#185, castraferrum#186)', () => {
  it('gives every count the UI shows a singular form: never "1 lines"', () => {
    const named = keysTheUiNames();
    const missing = (Object.keys(en) as MessageKey[]).filter(
      (k) => named.has(k) && !k.endsWith('.other') && !(k in NEVER_ONE) && COUNTS_PLURAL.test(en[k]),
    );
    expect(missing).toEqual([]);
  });

  it('joins a count and its word with a no-break space where a fold label or a log header can wrap', () => {
    const msgs: Record<string, Record<string, string>> = { en, vi };
    for (const lang of ['en', 'vi'])
      for (const base of ['tx.lines', 'tx.input', 'log.saved'])
        for (const form of ['one', 'other']) {
          const text = msgs[lang]![`${base}.${form}`];
          expect(text, `${lang} ${base}.${form}`).toMatch(/(\{n\}|\b1)\u00a0\p{L}/u);
          expect(text, `${lang} ${base}.${form}`).not.toMatch(/(\{n\}|\b1) \p{L}/u);
        }
  });
});
