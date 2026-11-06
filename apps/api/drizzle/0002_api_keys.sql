CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"mode" text NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "apps" DROP CONSTRAINT "apps_api_key_hash_unique";--> statement-breakpoint
ALTER TABLE "apps" DROP CONSTRAINT "apps_test_key_hash_unique";--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_app_idx" ON "api_keys" USING btree ("app_id");--> statement-breakpoint
-- Move each app's existing live and test key into api_keys before the old columns go.
INSERT INTO "api_keys" ("id", "app_id", "mode", "name", "hash", "prefix", "created_at")
SELECT gen_random_uuid()::text, "id", 'live', 'Default', "api_key_hash", "api_key_prefix", "created_at" FROM "apps" WHERE "api_key_hash" IS NOT NULL;--> statement-breakpoint
INSERT INTO "api_keys" ("id", "app_id", "mode", "name", "hash", "prefix", "created_at")
SELECT gen_random_uuid()::text, "id", 'test', 'Test', "test_key_hash", coalesce("test_key_prefix", ''), "created_at" FROM "apps" WHERE "test_key_hash" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "api_key_hash";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "api_key_prefix";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "test_key_hash";--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "test_key_prefix";