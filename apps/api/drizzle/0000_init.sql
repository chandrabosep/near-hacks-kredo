CREATE TABLE "apps" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"payout" text NOT NULL,
	"fee_bps" integer NOT NULL,
	"api_key_hash" text NOT NULL,
	"api_key_prefix" text NOT NULL,
	"prices" jsonb NOT NULL,
	"exchange_rate" text,
	"webhook_url" text,
	"webhook_secret" text,
	"test_key_hash" text,
	"test_key_prefix" text,
	"owner" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "apps_api_key_hash_unique" UNIQUE("api_key_hash"),
	CONSTRAINT "apps_test_key_hash_unique" UNIQUE("test_key_hash")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"claim_key" text PRIMARY KEY NOT NULL,
	"from" text NOT NULL,
	"units" numeric(78, 0) NOT NULL,
	"expiry" bigint NOT NULL,
	"status" text NOT NULL,
	"tx_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"block" integer NOT NULL,
	"log_index" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"user" text,
	"app" text,
	"from" text,
	"to" text,
	"units" numeric(78, 0),
	"fee" numeric(78, 0),
	"returned" numeric(78, 0),
	"hold_id" text,
	"claim_key" text
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"hold_id" text PRIMARY KEY NOT NULL,
	"app" text NOT NULL,
	"user" text NOT NULL,
	"units" numeric(78, 0) NOT NULL,
	"ref" text NOT NULL,
	"label" text NOT NULL,
	"expiry" bigint NOT NULL,
	"status" text NOT NULL,
	"tx_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops" (
	"id" text PRIMARY KEY NOT NULL,
	"app" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text,
	"user" text,
	"units" numeric(78, 0) NOT NULL,
	"fee" numeric(78, 0),
	"label" text,
	"hold_id" text,
	"tx_hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relayer_txs" (
	"seq" integer PRIMARY KEY NOT NULL,
	"hash" text,
	"fn" text NOT NULL,
	"app" text,
	"status" text NOT NULL,
	"gas_used" numeric(78, 0) NOT NULL,
	"l2_fee" numeric(78, 0) NOT NULL,
	"l1_fee" numeric(78, 0) NOT NULL,
	"error" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"privy_id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"app" text NOT NULL,
	"type" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer NOT NULL,
	"next_at" timestamp with time zone NOT NULL,
	"last_status" integer,
	"last_error" text
);
--> statement-breakpoint
CREATE INDEX "claims_from_idx" ON "claims" USING btree ("from");--> statement-breakpoint
CREATE INDEX "events_block_idx" ON "events" USING btree ("block","log_index");--> statement-breakpoint
CREATE INDEX "events_app_idx" ON "events" USING btree ("app");--> statement-breakpoint
CREATE INDEX "events_user_idx" ON "events" USING btree ("user");--> statement-breakpoint
CREATE INDEX "holds_status_idx" ON "holds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ops_app_kind_ref_idx" ON "ops" USING btree ("app","kind","ref");--> statement-breakpoint
CREATE INDEX "ops_tx_idx" ON "ops" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX "users_address_idx" ON "users" USING btree ("address");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries" USING btree ("status");