DROP INDEX "runs_one_active_per_loop";--> statement-breakpoint
ALTER TABLE "loops" ADD COLUMN "max_concurrent" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "runs_running_by_loop" ON "runs" USING btree ("loop_id") WHERE "runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "loops" ADD CONSTRAINT "loops_max_concurrent_range" CHECK ("loops"."max_concurrent" BETWEEN 1 AND 10);--> statement-breakpoint
-- replaces the partial unique index "one running run / loop" with "at most loops.max_concurrent running runs / loop".
-- Drizzle cannot describe triggers, so this part is hand-written. Lock the loop row (FOR UPDATE) before counting: two runs inserted at once
-- for the same loop queue up, and the later run sees the earlier one when counting (READ COMMITTED re-reads per statement). Only runs on INSERT of a
-- running run — lowering max_concurrent does not touch runs already running. Error 23514 carries the constraint name so the repository recognises it like the old index.
CREATE FUNCTION runs_max_concurrent_per_loop() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lim integer;
  n integer;
BEGIN
  SELECT max_concurrent INTO lim FROM loops WHERE id = NEW.loop_id FOR UPDATE;
  IF lim IS NULL THEN
    RETURN NEW; -- no such loop: let the foreign key report the error
  END IF;
  SELECT count(*) INTO n FROM runs WHERE loop_id = NEW.loop_id AND status = 'running';
  IF n >= lim THEN
    RAISE EXCEPTION 'loop % already has % running runs (max %)', NEW.loop_id, n, lim
      USING ERRCODE = 'check_violation', CONSTRAINT = 'runs_max_concurrent_per_loop', TABLE = 'runs';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER runs_max_concurrent_per_loop BEFORE INSERT ON runs
  FOR EACH ROW WHEN (NEW.status = 'running') EXECUTE FUNCTION runs_max_concurrent_per_loop();