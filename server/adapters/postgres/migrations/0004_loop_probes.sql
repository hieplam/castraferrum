CREATE TABLE "loop_probes" (
	"loop_id" uuid PRIMARY KEY NOT NULL,
	"command" jsonb NOT NULL,
	"claim" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"release" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lane_env" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lane_base_port" integer,
	"restart_policy" text DEFAULT 'stop' NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"last_line" text,
	"last_probe_at" timestamp with time zone,
	CONSTRAINT "loop_probes_restart_policy" CHECK ("loop_probes"."restart_policy" IN ('stop','resume')),
	CONSTRAINT "loop_probes_state" CHECK ("loop_probes"."state" IN ('active','waiting','blocked','held','budget_limited','complete','probe_failed'))
);
--> statement-breakpoint
ALTER TABLE "loop_probes" ADD CONSTRAINT "loop_probes_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."loops"("id") ON DELETE no action ON UPDATE no action;