CREATE TABLE "gate_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repo_id" uuid NOT NULL,
	"pr_number" integer NOT NULL,
	"head_sha" text NOT NULL,
	"task_key" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"failed_step" text,
	"queued_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"ratified_at" timestamp with time zone,
	CONSTRAINT "gate_jobs_state" CHECK ("gate_jobs"."state" IN ('queued','running','merged','failed','needs_ratification')),
	CONSTRAINT "gate_jobs_failed_step" CHECK ("gate_jobs"."failed_step" IS NULL OR "gate_jobs"."failed_step" IN ('scope','base','setup','green','stub','verify','ci','merge'))
);
--> statement-breakpoint
CREATE TABLE "gate_steps" (
	"job_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"step" text NOT NULL,
	"status" text NOT NULL,
	"exit_code" integer,
	"ms" integer NOT NULL,
	"output_tail" text NOT NULL,
	CONSTRAINT "gate_steps_job_id_seq_pk" PRIMARY KEY("job_id","seq"),
	CONSTRAINT "gate_steps_step" CHECK ("gate_steps"."step" IN ('scope','base','setup','green','stub','verify','ci','merge')),
	CONSTRAINT "gate_steps_status" CHECK ("gate_steps"."status" IN ('pass','fail','skip'))
);
--> statement-breakpoint
CREATE TABLE "repo_gate" (
	"repo_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"github_repo" text NOT NULL,
	"check_command" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_claims" ADD COLUMN "owner" text DEFAULT 'run' NOT NULL;--> statement-breakpoint
ALTER TABLE "run_claims" ADD COLUMN "gate_job_id" uuid;--> statement-breakpoint
ALTER TABLE "gate_jobs" ADD CONSTRAINT "gate_jobs_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_steps" ADD CONSTRAINT "gate_steps_job_id_gate_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."gate_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_gate" ADD CONSTRAINT "repo_gate_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gate_jobs_one_running" ON "gate_jobs" USING btree ("state") WHERE "gate_jobs"."state" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "gate_jobs_one_live_per_head" ON "gate_jobs" USING btree ("repo_id","pr_number","head_sha") WHERE "gate_jobs"."state" IN ('queued','running');--> statement-breakpoint
CREATE INDEX "gate_jobs_queued" ON "gate_jobs" USING btree ("queued_at","id") WHERE "gate_jobs"."state" = 'queued';--> statement-breakpoint
ALTER TABLE "run_claims" ADD CONSTRAINT "run_claims_gate_job_id_gate_jobs_id_fk" FOREIGN KEY ("gate_job_id") REFERENCES "public"."gate_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_claims" ADD CONSTRAINT "run_claims_owner" CHECK ("run_claims"."owner" IN ('run','gate'));--> statement-breakpoint
ALTER TABLE "run_claims" ADD CONSTRAINT "run_claims_gate_owner_has_job" CHECK (("run_claims"."owner" = 'gate') = ("run_claims"."gate_job_id" IS NOT NULL));