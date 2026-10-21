import { defineConfig } from 'drizzle-kit';
import { databaseUrl, loadDotEnv } from './server/config.ts';

loadDotEnv();

// `npm run db:generate` generates the SQL migration from schema.ts; commit the whole migrations/ folder.
// The server applies migrations at start-up (server/adapters/postgres/db.ts).
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/adapters/postgres/schema.ts',
  out: './server/adapters/postgres/migrations',
  dbCredentials: { url: databaseUrl(process.env, 'main') },
});
