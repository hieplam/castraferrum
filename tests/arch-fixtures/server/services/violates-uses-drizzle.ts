// violates: services-call-ports-only
// A service does not touch a DB library.
import { sql } from 'drizzle-orm';
export const q = sql`select 1`;
