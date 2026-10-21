// violates: entry-layer-no-db
import pg from 'pg';
export const pool = new pg.Pool();
