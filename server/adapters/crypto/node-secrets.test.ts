import { describe, expect, it } from 'vitest';
import { NodeSecrets } from './node-secrets';

describe('NodeSecrets', () => {
  it('a token is 32 random bytes in base64url, and no two are the same', () => {
    const secrets = new NodeSecrets();
    const tokens = new Set(Array.from({ length: 100 }, () => secrets.newToken()));
    expect(tokens.size).toBe(100);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(t, 'base64url')).toHaveLength(32);
    }
  });

  it('same() is true only for equal strings, whatever their lengths', () => {
    const secrets = new NodeSecrets();
    expect(secrets.same('password1', 'password1')).toBe(true);
    expect(secrets.same('password2', 'password1')).toBe(false);
    expect(secrets.same('password', 'password1')).toBe(false);
    expect(secrets.same('', 'password1')).toBe(false);
    expect(secrets.same('p\u00e4ssword1', 'p\u00e4ssword1')).toBe(true);
  });
});
