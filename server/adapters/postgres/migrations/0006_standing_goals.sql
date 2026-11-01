CREATE TABLE "standing_goals" (
	"repo" text NOT NULL,
	"row_id" text NOT NULL,
	"state" text NOT NULL,
	"last_line" text,
	"last_run_at" timestamp with time zone NOT NULL,
	CONSTRAINT "standing_goals_repo_row_id_pk" PRIMARY KEY("repo","row_id"),
	CONSTRAINT "standing_goals_state" CHECK ("standing_goals"."state" IN ('passing','failing'))
);
--> statement-breakpoint
CREATE TABLE "standing_issues" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"row_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"issue_number" integer NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"last_failed_at" timestamp with time zone NOT NULL,
	"fail_count" integer DEFAULT 1 NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "standing_schedule" (
	"repo" text PRIMARY KEY NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"next_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "standing_issues_one_open_per_fingerprint" ON "standing_issues" USING btree ("repo","fingerprint") WHERE "standing_issues"."closed_at" IS NULL;