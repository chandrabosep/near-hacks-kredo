CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"website" text,
	"category" text,
	"support_email" text,
	"owner" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "category" text;--> statement-breakpoint
CREATE INDEX "companies_owner_idx" ON "companies" USING btree ("owner");--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;