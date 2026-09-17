CREATE TABLE "lr_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"campaign_ref" text,
	"campaign_name" text,
	"campaign_display_id" text,
	"user_name" text,
	"phone" text,
	"email" text,
	"raw" jsonb
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "lr_id" integer;--> statement-breakpoint
CREATE INDEX "lr_events_campaign_idx" ON "lr_events" USING btree ("campaign_display_id","at");