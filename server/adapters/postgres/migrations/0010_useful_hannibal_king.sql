ALTER TABLE "loop_executions" DROP CONSTRAINT "executions_end_reason";--> statement-breakpoint
ALTER TABLE "run_claims" ADD COLUMN "kind" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "loop_executions" ADD CONSTRAINT "executions_end_reason" CHECK ("loop_executions"."end_reason" IN ('stopped','server_down','goal_met'));--> statement-breakpoint
ALTER TABLE "run_claims" ADD CONSTRAINT "run_claims_kind" CHECK ("run_claims"."kind" IN ('task','plan'));