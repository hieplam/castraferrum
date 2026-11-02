ALTER TABLE "loop_probes" ADD COLUMN "rank" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "loop_probes" ADD COLUMN "token_budget" bigint;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "tokens" bigint;