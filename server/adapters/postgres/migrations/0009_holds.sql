CREATE TABLE "resource_holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"resource" text NOT NULL,
	"reason" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"until" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"opened_by_run_id" uuid,
	"trial_run_id" uuid
);
--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_status";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "resume_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_holds_one_open" ON "resource_holds" USING btree ("resource") WHERE "resource_holds"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "runs_held" ON "runs" USING btree ("started_at","id") WHERE "runs"."status" = 'held';--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_status" CHECK ("runs"."status" IN ('running','succeeded','failed','cancelled','timed_out','interrupted','skipped','held'));