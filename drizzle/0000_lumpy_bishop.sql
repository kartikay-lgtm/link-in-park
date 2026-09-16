CREATE TABLE "campaigns" (
	"display_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"deeplink" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"android_web_redirect" text DEFAULT '' NOT NULL,
	"ios_web_redirect" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'console' NOT NULL,
	"lr_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clicks" integer,
	"installs" integer,
	"signups" integer,
	"stats_at" timestamp with time zone,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_display_id" text NOT NULL,
	"identifier" text NOT NULL,
	"url" text NOT NULL,
	"field" text DEFAULT 'website' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reporting_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_display_id" text NOT NULL,
	"clicks" integer,
	"installs" integer,
	"signups" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"next_page" integer DEFAULT 1 NOT NULL,
	"pages" integer DEFAULT 1 NOT NULL,
	"last_request_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_campaign_display_id_campaigns_display_id_fk" FOREIGN KEY ("campaign_display_id") REFERENCES "public"."campaigns"("display_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "redirects_identifier_idx" ON "redirects" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "redirects_campaign_idx" ON "redirects" USING btree ("campaign_display_id");--> statement-breakpoint
CREATE INDEX "snapshots_campaign_time_idx" ON "reporting_snapshots" USING btree ("campaign_display_id","fetched_at");