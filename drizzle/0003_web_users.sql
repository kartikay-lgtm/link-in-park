CREATE TABLE "web_user_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"file" text NOT NULL,
	"rows" integer NOT NULL,
	"added" integer NOT NULL,
	"updated" integer NOT NULL,
	"content" text
);
--> statement-breakpoint
CREATE TABLE "web_users_raw" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
