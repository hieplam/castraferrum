import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Secrets } from '../../ports/secrets';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/** `Secrets` on Node `crypto`: `randomBytes` for tokens, `timingSafeEqual` over SHA-256 digests for compares (spec D4). */
export class NodeSecrets implements Secrets {
  newToken(): string {
    return randomBytes(32).toString('base64url');
  }

  same(given: string, expected: string): boolean {
    return timingSafeEqual(digest(given), digest(expected));
  }
}
