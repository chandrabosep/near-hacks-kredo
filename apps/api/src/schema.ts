/**
 * Postgres tables for what the chain doesn't hold. Balances, limits and reserves stay onchain;
 * these tables keep app settings, API keys, users, the relayer's gas ledger and indexed events.
 */
import { bigint, customType, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { PriceList } from "./pricing.js";

/** Token amounts: numeric in Postgres (no overflow), bigint in TypeScript. */
const amount = customType<{ data: bigint; driverData: string }>({
  dataType: () => "numeric(78, 0)",
  toDriver: (v) => v.toString(),
  fromDriver: (v) => BigInt(String(v)),
});

const time = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
/** Unix seconds, as the vault uses for expiries. */
const seconds = (name: string) => bigint(name, { mode: "number" });

export const apps = pgTable("apps", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  payout: text("payout").notNull(),
  feeBps: integer("fee_bps").notNull(),
  apiKeyHash: text("api_key_hash").notNull().unique(),
  apiKeyPrefix: text("api_key_prefix").notNull(),
  prices: jsonb("prices").$type<PriceList>().notNull(),
  exchangeRate: text("exchange_rate"),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  testKeyHash: text("test_key_hash").unique(),
  testKeyPrefix: text("test_key_prefix"),
  owner: text("owner"),
  createdAt: time("created_at").notNull(),
});

export const users = pgTable(
  "users",
  {
    privyId: text("privy_id").primaryKey(),
    address: text("address").notNull(),
    email: text("email"),
    createdAt: time("created_at").notNull(),
  },
  (t) => [index("users_address_idx").on(t.address), index("users_email_idx").on(t.email)],
);

export const ops = pgTable(
  "ops",
  {
    /** txHash:kind. One transaction carries one op of each kind at most. */
    id: text("id").primaryKey(),
    app: text("app").notNull(),
    kind: text("kind").notNull(),
    ref: text("ref"),
    user: text("user"),
    units: amount("units").notNull(),
    fee: amount("fee"),
    label: text("label"),
    holdId: text("hold_id"),
    txHash: text("tx_hash").notNull(),
    at: time("at").notNull(),
  },
  (t) => [index("ops_app_kind_ref_idx").on(t.app, t.kind, t.ref), index("ops_tx_idx").on(t.txHash)],
);

export const holds = pgTable(
  "holds",
  {
    holdId: text("hold_id").primaryKey(),
    app: text("app").notNull(),
    user: text("user").notNull(),
    units: amount("units").notNull(),
    ref: text("ref").notNull(),
    label: text("label").notNull(),
    expiry: seconds("expiry").notNull(),
    status: text("status").notNull(),
    txHash: text("tx_hash").notNull(),
  },
  (t) => [index("holds_status_idx").on(t.status)],
);

export const claims = pgTable(
  "claims",
  {
    claimKey: text("claim_key").primaryKey(),
    from: text("from").notNull(),
    units: amount("units").notNull(),
    expiry: seconds("expiry").notNull(),
    status: text("status").notNull(),
    txHash: text("tx_hash").notNull(),
    createdAt: time("created_at").notNull(),
  },
  (t) => [index("claims_from_idx").on(t.from)],
);

export const relayerTxs = pgTable("relayer_txs", {
  /** Order the relayer sent them in. */
  seq: integer("seq").primaryKey(),
  hash: text("hash"),
  fn: text("fn").notNull(),
  app: text("app"),
  status: text("status").notNull(),
  gasUsed: amount("gas_used").notNull(),
  l2Fee: amount("l2_fee").notNull(),
  l1Fee: amount("l1_fee").notNull(),
  error: text("error"),
  at: time("at").notNull(),
});

export const events = pgTable(
  "events",
  {
    /** txHash:logIndex. */
    id: text("id").primaryKey(),
    event: text("event").notNull(),
    block: integer("block").notNull(),
    logIndex: integer("log_index").notNull(),
    txHash: text("tx_hash").notNull(),
    at: time("at").notNull(),
    user: text("user"),
    app: text("app"),
    from: text("from"),
    to: text("to"),
    units: amount("units"),
    fee: amount("fee"),
    returned: amount("returned"),
    holdId: text("hold_id"),
    claimKey: text("claim_key"),
  },
  (t) => [index("events_block_idx").on(t.block, t.logIndex), index("events_app_idx").on(t.app), index("events_user_idx").on(t.user)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    /** The event id, so each event reaches its app once. */
    id: text("id").primaryKey(),
    app: text("app").notNull(),
    type: text("type").notNull(),
    body: text("body").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull(),
    nextAt: time("next_at").notNull(),
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
  },
  (t) => [index("webhook_deliveries_status_idx").on(t.status)],
);

/** Single values: the chain's genesis hash and the indexer's cursor. */
export const meta = pgTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
