-- Runs once, when the Postgres volume is first initialised (docker-entrypoint-initdb.d).
-- The loops DB is created by POSTGRES_DB; this is a separate DB for tests so they never touch real data.
CREATE DATABASE loops_test OWNER loops;
