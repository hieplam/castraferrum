import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../../ports/ids';

export class RandomIdGenerator implements IdGenerator {
  newId(): string {
    return randomUUID();
  }
}
