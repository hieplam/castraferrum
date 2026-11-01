CREATE TABLE "goal_runs" (
	"repo" text NOT NULL,
	"manifest" text NOT NULL,
	"row_id" text NOT NULL,
	"pass" boolean NOT NULL,
	"value" double precision,
	"of" double precision,
	"line" text NOT NULL,
	"cadence" text NOT NULL,
	"sha" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "goal_runs_repo_manifest_row_id_pk" PRIMARY KEY("repo","manifest","row_id"),
	CONSTRAINT "goal_runs_cadence" CHECK ("goal_runs"."cadence" IN ('merge','nightly'))
);
