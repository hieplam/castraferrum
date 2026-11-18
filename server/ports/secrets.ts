/** Secret material for sign-in (remote-access spec D3, D4). */
export interface Secrets {
  /** A fresh session token: 32 random bytes, base64url. */
  newToken(): string;
  /**
   * Whether `given` equals `expected`, in a time that does not depend on where they differ (constant-time compare of their
   * SHA-256 digests, so the length of the configured value does not leak either).
   */
  same(given: string, expected: string): boolean;
}
