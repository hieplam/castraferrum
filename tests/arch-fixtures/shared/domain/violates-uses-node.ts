// violates: domain-only-pure-libraries
// The domain also runs in the browser: no Node modules.
import { randomUUID } from 'node:crypto';
export const newId = () => randomUUID();
