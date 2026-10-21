// globalSetup of the test groups that need a DB (contract, api): the compose.yml Postgres must be running.
// The DB loops_test is created by pg-init the first time; a volume that predates pg-init gets it created here.
import pg from 'pg';
import { databaseUrl, redactUrl } from '../../server/config';

export default async function setup(): Promise<void> {
  const url = databaseUrl(process.env, 'test');
  try {
    await withClient(url, async () => {});
  } catch (err) {
    if ((err as { code?: string }).code !== '3D000') {
      throw new Error(
        `Cannot connect to the test Postgres at ${redactUrl(url)} (${(err as Error).message}). ` +
          'Start Postgres: docker compose -f compose.yml up -d (inside loop-console/)',
      );
    }
    const target = new URL(url);
    const name = target.pathname.slice(1);
    target.pathname = '/postgres';
    await withClient(target.toString(), (c) => c.query(`CREATE DATABASE "${name}"`));
  }
}

async function withClient(url: string, fn: (c: pg.Client) => Promise<unknown>): Promise<void> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  await client.connect();
  try {
    await fn(client);
  } finally {
    await client.end();
  }
}
