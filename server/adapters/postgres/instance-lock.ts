import type pg from 'pg';

// One DB — one server. If two processes point at the same DB, the later one runs recovery at startup and marks every run
// the earlier process is really running as `interrupted` (UC-15 only holds with a single server). Postgres's advisory lock
// is held on a dedicated connection for the life of the process: when the process dies Postgres releases the lock itself.

/** Castraferrum's 64-bit advisory lock key ("loop" + "cons" as ASCII codes). */
const LOCK_KEY = 0x6c6f6f70_636f6e73n;

export type InstanceLock = { release(): Promise<void> };

export class InstanceLockTakenError extends Error {
  constructor(dbName: string) {
    super(`Another Castraferrum server is already running on DB "${dbName}" — stop it first (or point DATABASE_URL at a different DB)`);
    this.name = 'InstanceLockTakenError';
  }
}

export async function acquireInstanceLock(pool: pg.Pool): Promise<InstanceLock> {
  const client = await pool.connect();
  // The held connection (outside the pool) emits 'error' on itself when Postgres stops — uncaught, it would kill the process.
  client.on('error', () => {});
  try {
    const res = await client.query<{ ok: boolean; db: string }>(
      'SELECT pg_try_advisory_lock($1::bigint) AS ok, current_database() AS db',
      [LOCK_KEY.toString()],
    );
    const row = res.rows[0];
    if (!row?.ok) throw new InstanceLockTakenError(row?.db ?? '?');
  } catch (err) {
    client.release();
    throw err;
  }
  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      try {
        await client.query('SELECT pg_advisory_unlock($1::bigint)', [LOCK_KEY.toString()]);
      } catch {
        // Once the connection is lost Postgres has already released the lock.
      }
      client.release();
    },
  };
}

