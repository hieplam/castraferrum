CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" text NOT NULL,
	"loop_id" uuid,
	"message_key" text NOT NULL,
	"params" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notices_kind" CHECK ("notices"."kind" IN ('wait','hold','blocked','gate','goal_card','probe_failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notices_one_unread_per_key" ON "notices" USING btree ("dedupe_key") WHERE "notices"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "notices_unread_by_time" ON "notices" USING btree ("at" DESC NULLS LAST) WHERE "notices"."read_at" IS NULL;