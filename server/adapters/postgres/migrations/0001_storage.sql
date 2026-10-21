CREATE TABLE "loop_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"loop_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "executions_loop_seq" UNIQUE("loop_id","seq"),
	CONSTRAINT "executions_end_reason" CHECK ("loop_executions"."end_reason" IN ('stopped','server_down')),
	CONSTRAINT "executions_ended_has_reason" CHECK (("loop_executions"."ended_at" IS NULL) = ("loop_executions"."end_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "loops" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"prompt" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text NOT NULL,
	"timeout_sec" integer NOT NULL,
	"overlap_policy" text DEFAULT 'skip' NOT NULL,
	"executor_kind" text NOT NULL,
	"executor_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"next_run_at" timestamp with time zone,
	"run_counter" integer DEFAULT 0 NOT NULL,
	"execution_counter" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "loops_name_length" CHECK (length("loops"."name") BETWEEN 1 AND 80),
	CONSTRAINT "loops_timeout_range" CHECK ("loops"."timeout_sec" BETWEEN 60 AND 86400),
	CONSTRAINT "loops_overlap_policy" CHECK ("loops"."overlap_policy" IN ('skip')),
	CONSTRAINT "loops_status" CHECK ("loops"."status" IN ('active','stopped')),
	CONSTRAINT "loops_archived_is_stopped" CHECK ("loops"."archived_at" IS NULL OR "loops"."status" = 'stopped'),
	CONSTRAINT "loops_next_run_only_active" CHECK ("loops"."status" = 'active' OR "loops"."next_run_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "run_logs" (
	"run_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	CONSTRAINT "run_logs_run_id_seq_pk" PRIMARY KEY("run_id","seq"),
	CONSTRAINT "run_logs_level" CHECK ("run_logs"."level" IN ('info','warn','error'))
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"loop_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"iteration" integer,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"skip_reason" text,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"prompt_snapshot" text NOT NULL,
	"executor_kind" text NOT NULL,
	"executor_config" jsonb NOT NULL,
	"summary" text,
	"error" text,
	"cost_usd" numeric(12, 6),
	"session_id" text,
	CONSTRAINT "runs_loop_iteration" UNIQUE("loop_id","iteration"),
	CONSTRAINT "runs_trigger" CHECK ("runs"."trigger" IN ('start','schedule')),
	CONSTRAINT "runs_status" CHECK ("runs"."status" IN ('running','succeeded','failed','cancelled','timed_out','interrupted','skipped'))
);
--> statement-breakpoint
ALTER TABLE "loop_executions" ADD CONSTRAINT "loop_executions_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."loops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_logs" ADD CONSTRAINT "run_logs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."loops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_execution_id_loop_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."loop_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "executions_one_open_per_loop" ON "loop_executions" USING btree ("loop_id") WHERE "loop_executions"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "executions_by_loop" ON "loop_executions" USING btree ("loop_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "loops_name_live" ON "loops" USING btree (lower("name")) WHERE "loops"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "loops_due" ON "loops" USING btree ("next_run_at") WHERE "loops"."status" = 'active' AND "loops"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "runs_one_active_per_loop" ON "runs" USING btree ("loop_id") WHERE "runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "runs_by_loop" ON "runs" USING btree ("loop_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_by_execution" ON "runs" USING btree ("execution_id","started_at");--> statement-breakpoint
CREATE INDEX "runs_overdue" ON "runs" USING btree ("deadline_at") WHERE "runs"."status" = 'running';