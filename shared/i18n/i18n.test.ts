// i18n keys en <-> vi (UC-18 "no text lacks a translation"): the same key set, no empty string, the same `{x}` parameters.
// The key set comes from en.ts (`MessageKey`); vi.ts is `Record<MessageKey, string>`, so the typecheck already catches a
// missing key. This test also catches an extra key, an empty string and a parameter mismatch (for example `{n}` in en
// that vi forgot: the Vietnamese UI would show no number).
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
