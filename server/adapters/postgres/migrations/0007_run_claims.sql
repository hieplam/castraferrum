CREATE TABLE "run_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"loop_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"run_id" uuid NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text
);
--> statement-breakpoint
ALTER TABLE "runs" DROP CONSTRAINT "runs_trigger";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "task_key" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "slot" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "end_result" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "end_pr" text;--> statement-breakpoint
ALTER TABLE "run_claims" ADD CONSTRAINT "run_claims_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."loops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_claims_one_open_per_task" ON "run_claims" USING btree ("loop_id","task_key") WHERE "run_claims"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "run_claims_open" ON "run_claims" USING btree ("opened_at") WHERE "run_claims"."closed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_trigger" CHECK ("runs"."trigger" IN ('start','schedule','probe'));