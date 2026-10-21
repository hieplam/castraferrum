CREATE TABLE "server_heartbeat" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"beat_at" timestamp with time zone NOT NULL,
	CONSTRAINT "server_heartbeat_one_row" CHECK ("server_heartbeat"."id")
);
