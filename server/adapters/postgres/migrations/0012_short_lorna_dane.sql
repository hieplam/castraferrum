CREATE TABLE "goal_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"repo_id" uuid NOT NULL,
	"github_repo" text NOT NULL,
	"issue_number" integer NOT NULL,
	"title" text NOT NULL,
	"door" text NOT NULL,
	"card" jsonb NOT NULL,
	"state" text DEFAULT 'proposed' NOT NULL,
	"start_after" timestamp with time zone,
	"changed" boolean DEFAULT false NOT NULL,
	"epic_number" integer,
	"pr_number" integer,
	"loop_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "goal_cards_state" CHECK ("goal_cards"."state" IN ('proposed','accepted','refused','started')),
	CONSTRAINT "goal_cards_door" CHECK ("goal_cards"."door" IN ('one-way','two-way'))
);
--> statement-breakpoint
ALTER TABLE "goal_cards" ADD CONSTRAINT "goal_cards_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goal_cards_one_proposed" ON "goal_cards" USING btree ("repo_id") WHERE "goal_cards"."state" = 'proposed';--> statement-breakpoint
CREATE UNIQUE INDEX "goal_cards_one_per_issue" ON "goal_cards" USING btree ("repo_id","issue_number");