/**
 * Storage for what the chain doesn't hold: API keys, hold metadata, users, the relayer's gas
 * ledger and indexed events. The chain is the source of truth for every balance.
 *
 * Postgres (DATABASE_URL) in production; an embedded Postgres (pglite) on disk locally and in
 * memory for tests. One API process owns the data: reads come from memory, and every change is
 * written to Postgres shortly after (save) or right away (flush). A write sends only the rows
 * that changed since the last one, inside one transaction.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { asc, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgColumn, PgDatabase, PgQueryResultHKT, PgTable } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";
import type { AccountId, TxHash } from "./near.js";
import type { PriceList } from "./pricing.js";
import * as schema from "./schema.js";

/** The business behind one or more apps. Shown to users in the directory and on the connect page. */
export type CompanyRecord = {
  id: string;
  name: string;
  logoUrl?: string;
  website?: string;
  category?: string;
  supportEmail?: string;
  /** The Privy user who set it up. */
  owner: string;
  createdAt: number;
};

export type AppRecord = {
  /** The app's id in the vault, such as "app-3f9c2a1b". Only an identifier: nobody holds a key for it. */
  id: string;
  name: string;
  companyId?: string;
  /** Profile. Logo, website and category fall back to the company's. */
  description?: string;
  logoUrl?: string;
  website?: string;
  category?: string;
  payout: AccountId;
  feeBps: number;
  /** Deep mode: what each action costs, in credits. */
  prices: PriceList;
  /** Light mode: how many of our credits buy one of the app's own credits (e.g. "2"). */
  exchangeRate?: string;
  webhookUrl?: string;
  /** Signs webhook payloads (HMAC-SHA256). Kept in full: signing needs the secret itself. */
  webhookSecret?: string;
  /** The Privy user who registered it from the dashboard. Admin-registered apps have none. */
  owner?: string;
  createdAt: number;
};

/** One API key. Live keys move real credits; test keys work against fake credits only. */
export type ApiKeyRecord = {
  id: string;
  appId: string;
  mode: "live" | "test";
  name: string;
  /** sha256 of the key. The key itself is shown once, at creation. */
  hash: string;
  /** First characters of the key, so the dashboard can show which key is which. */
  prefix: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
};

/** Every credit-moving action the API performed for an app. Feeds idempotency, CSV and gas. */
export type OpRecord = {
  app: string;
  kind: "charge" | "hold" | "capture" | "release" | "refund" | "payout" | "convert";
  /** The app's own reference, as it sent it. Unique per app and kind. */
  ref?: string;
  user?: AccountId;
  units: bigint;
  fee?: bigint;
  label?: string;
  holdId?: string;
  txHash: TxHash;
  at: number;
};

/** A user, as first seen through Privy. Balances live onchain. */
export type UserRecord = {
  privyId: string;
  /** The user's NEAR account: the implicit account of their Privy NEAR wallet. */
  address: AccountId;
  email?: string;
  createdAt: number;
  /** When this user took test USDT from the faucet. Once per account. */
  faucetAt?: number;
};

/** Claim links a user created, so the wallet can list and cancel them. */
export type ClaimRecord = {
  /** The link's ed25519 public key, "ed25519:...". */
  claimKey: string;
  from: AccountId;
  units: bigint;
  expiry: number;
  status: "open" | "claimed" | "cancelled";
  txHash: TxHash;
  createdAt: number;
};

export type HoldRecord = {
  holdId: string;
  app: string;
  user: AccountId;
  units: bigint;
  ref: string;
  label: string;
  expiry: number;
  status: "open" | "captured" | "released";
  txHash: TxHash;
};

/** What the relayer paid for one transaction, in yoctoNEAR. */
export type RelayerTx = {
  hash?: TxHash;
  fn: string;
  /** The app this transaction was for, when there is one. */
  app?: string;
  status: "pending" | "success" | "reverted" | "failed";
  /** Gas units burnt across every receipt. */
  gasUsed: bigint;
  /** NEAR burnt for that gas, in yoctoNEAR. */
  fee: bigint;
  error?: string;
  at: number;
};

/** One decoded vault event. Read models (activity, stats, webhooks) are built from these. */
export type ActivityEvent = {
  /** txHash:index of the event in that transaction, unique per event. */
  id: string;
  event: string;
  block: number;
  logIndex: number;
  txHash: TxHash;
  /** Block time, ms. */
  at: number;
  user?: AccountId;
  app?: string;
  from?: AccountId;
  to?: AccountId;
  units?: bigint;
  fee?: bigint;
  /** Credits a partial capture handed back. */
  returned?: bigint;
  holdId?: string;
  claimKey?: string;
};

/** A webhook waiting to be delivered, or already delivered. Retried with backoff. */
export type WebhookDelivery = {
  /** eventId, so each event is delivered to its app once. */
  id: string;
  app: string;
  type: string;
  body: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  nextAt: number;
  lastStatus?: number;
  lastError?: string;
};

export type Data = {
  /** The network and vault this data belongs to, such as "testnet:vault.kredo-network.testnet". */
  genesis?: string;
  companies: CompanyRecord[];
  apps: AppRecord[];
  apiKeys: ApiKeyRecord[];
  holds: HoldRecord[];
  ops: OpRecord[];
  users: UserRecord[];
  claims: ClaimRecord[];
  txs: RelayerTx[];
  events: ActivityEvent[];
  /** Height of the last block whose events were stored. */
  cursor?: number;
  deliveries: WebhookDelivery[];
};

export type Db = {
  data: Data;
  /** Where the data lives, for logs. */
  where: string;
  /** Schedules a write. Cheap to call after every change. */
  save(): void;
  /** Writes now. */
  flush(): Promise<void>;
  /** Clears everything, for a replaced local chain. */
  reset(): Promise<void>;
  /** Writes what's pending and closes the connection. */
  close(): Promise<void>;
};

export type DbOptions = {
  /** A Postgres connection string. Without one, an embedded Postgres is used. */
  url?: string;
  /** Folder for the embedded Postgres. Without one (and no url), data is kept in memory. */
  dir?: string;
  debounceMs?: number;
};

type Collection = Exclude<keyof Data, "genesis" | "cursor">;
type Row = Record<string, unknown>;
// Both drivers share Drizzle's Postgres query builder.
type Orm = PgDatabase<PgQueryResultHKT, typeof schema>;

const empty = (): Data => ({ companies: [], apps: [], apiKeys: [], holds: [], ops: [], users: [], claims: [], txs: [], events: [], deliveries: [] });

const replacer = (_key: string, v: unknown) => (typeof v === "bigint" ? { $bigint: v.toString() } : v);
const reviver = (_key: string, v: unknown) =>
  v !== null && typeof v === "object" && "$bigint" in v ? BigInt((v as { $bigint: string }).$bigint) : v;

/** Rows come back with null for empty columns; records leave those fields out. */
function clean(row: Row, drop: string[] = []): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (v !== null && !drop.includes(k)) out[k] = v instanceof Date ? v.getTime() : v;
  return out;
}

/** Millisecond fields become timestamps. */
function withDates(record: object, fields: string[], extra: Row = {}): Row {
  const row: Row = { ...record, ...extra };
  for (const f of fields) if (typeof row[f] === "number") row[f] = new Date(row[f] as number);
  return row;
}

type Spec = {
  table: PgTable;
  pk: PgColumn;
  key: (r: never, i: number) => string;
  toRow: (r: never, i: number) => Row;
  fromRow: (row: Row) => unknown;
  order: (PgColumn | SQL)[];
};

const SPECS: Record<Collection, Spec> = {
  // Companies first: apps refer to them.
  companies: {
    table: schema.companies,
    pk: schema.companies.id,
    key: (r: CompanyRecord) => r.id,
    toRow: (r: CompanyRecord) => withDates(r, ["createdAt"]),
    fromRow: (row) => clean(row),
    order: [asc(schema.companies.createdAt)],
  },
  apps: {
    table: schema.apps,
    pk: schema.apps.id,
    key: (r: AppRecord) => r.id,
    toRow: (r: AppRecord) => withDates(r, ["createdAt"]),
    fromRow: (row) => clean(row),
    order: [asc(schema.apps.createdAt)],
  },
  apiKeys: {
    table: schema.apiKeys,
    pk: schema.apiKeys.id,
    key: (r: ApiKeyRecord) => r.id,
    toRow: (r: ApiKeyRecord) => withDates(r, ["createdAt", "lastUsedAt", "revokedAt"]),
    fromRow: (row) => clean(row),
    order: [asc(schema.apiKeys.createdAt)],
  },
  users: {
    table: schema.users,
    pk: schema.users.privyId,
    key: (r: UserRecord) => r.privyId,
    toRow: (r: UserRecord) => withDates(r, ["createdAt", "faucetAt"]),
    fromRow: (row) => clean(row),
    order: [asc(schema.users.createdAt)],
  },
  ops: {
    table: schema.ops,
    pk: schema.ops.id,
    key: (r: OpRecord) => `${r.txHash}:${r.kind}`,
    toRow: (r: OpRecord) => withDates(r, ["at"], { id: `${r.txHash}:${r.kind}` }),
    fromRow: (row) => clean(row, ["id"]),
    order: [asc(schema.ops.at)],
  },
  holds: {
    table: schema.holds,
    pk: schema.holds.holdId,
    key: (r: HoldRecord) => r.holdId,
    toRow: (r: HoldRecord) => ({ ...r }),
    fromRow: (row) => clean(row),
    order: [asc(schema.holds.expiry)],
  },
  claims: {
    table: schema.claims,
    pk: schema.claims.claimKey,
    key: (r: ClaimRecord) => r.claimKey,
    toRow: (r: ClaimRecord) => withDates(r, ["createdAt"]),
    fromRow: (row) => clean(row),
    order: [asc(schema.claims.createdAt)],
  },
  txs: {
    table: schema.relayerTxs,
    pk: schema.relayerTxs.seq,
    // The ledger only grows, so its position is a stable key.
    key: (_r: RelayerTx, i: number) => String(i),
    toRow: (r: RelayerTx, i: number) => withDates(r, ["at"], { seq: i }),
    fromRow: (row) => clean(row, ["seq"]),
    order: [asc(schema.relayerTxs.seq)],
  },
  events: {
    table: schema.events,
    pk: schema.events.id,
    key: (r: ActivityEvent) => r.id,
    toRow: (r: ActivityEvent) => withDates(r, ["at"]),
    fromRow: (row) => clean(row),
    order: [asc(schema.events.block), asc(schema.events.logIndex)],
  },
  deliveries: {
    table: schema.webhookDeliveries,
    pk: schema.webhookDeliveries.id,
    key: (r: WebhookDelivery) => r.id,
    toRow: (r: WebhookDelivery) => withDates(r, ["nextAt"]),
    fromRow: (row) => clean(row),
    order: [asc(schema.webhookDeliveries.nextAt)],
  },
};

const COLLECTIONS = Object.keys(SPECS) as Collection[];
const CHUNK = 500;

const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

/** On conflict, take every non-key column from the new row. */
function excludedSet(table: PgTable) {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([, c]) => !c.primary)
      .map(([k, c]) => [k, sql.raw(`excluded."${c.name}"`)]),
  );
}

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = resolve(here, "../drizzle");

async function connect(opts: DbOptions): Promise<{ orm: Orm; where: string; end: () => Promise<void> }> {
  if (opts.url) {
    const pool = new pg.Pool({ connectionString: opts.url, max: 5 });
    const orm = drizzlePg({ client: pool, schema });
    await migratePg(orm, { migrationsFolder: MIGRATIONS });
    return { orm: orm as unknown as Orm, where: `postgres ${new URL(opts.url).host}`, end: () => pool.end() };
  }
  if (opts.dir) mkdirSync(opts.dir, { recursive: true });
  const client = new PGlite(opts.dir);
  const orm = drizzlePglite({ client, schema });
  await migratePglite(orm, { migrationsFolder: MIGRATIONS });
  return { orm: orm as unknown as Orm, where: opts.dir ? `embedded postgres ${opts.dir}` : "embedded postgres (memory)", end: () => client.close() };
}

export async function openDb(opts: DbOptions = {}): Promise<Db> {
  const { orm, where, end } = await connect(opts);
  const data = empty();
  /** What each row looked like at the last write, by key, so a write sends only changes. */
  const written = new Map<Collection, Map<string, string>>(COLLECTIONS.map((c) => [c, new Map()]));
  let writtenMeta: Record<string, string> = {};

  const snapshot = (c: Collection) => {
    const out = new Map<string, string>();
    (data[c] as never[]).forEach((r, i) => out.set(SPECS[c].key(r, i), JSON.stringify(r, replacer)));
    return out;
  };
  const metaNow = (): Record<string, string> => ({
    ...(data.genesis ? { genesis: data.genesis } : {}),
    ...(data.cursor !== undefined ? { cursor: String(data.cursor) } : {}),
  });

  for (const c of COLLECTIONS) {
    const spec = SPECS[c];
    const rows = (await orm.select().from(spec.table).orderBy(...spec.order)) as Row[];
    (data as Record<Collection, unknown[]>)[c] = rows.map(spec.fromRow);
    written.set(c, snapshot(c));
  }
  for (const { key, value } of await orm.select().from(schema.meta)) {
    if (key === "genesis") data.genesis = value;
    if (key === "cursor") data.cursor = Number(value);
  }
  writtenMeta = metaNow();

  async function write() {
    const plan = COLLECTIONS.map((c) => {
      const spec = SPECS[c];
      const before = written.get(c)!;
      const after = new Map<string, string>();
      const upserts: Row[] = [];
      (data[c] as never[]).forEach((r, i) => {
        const key = spec.key(r, i);
        const json = JSON.stringify(r, replacer);
        after.set(key, json);
        if (before.get(key) !== json) upserts.push(spec.toRow(r, i));
      });
      const deletes = [...before.keys()].filter((k) => !after.has(k));
      return { c, spec, upserts, deletes, after };
    });
    const meta = metaNow();
    const metaChanged = Object.entries(meta).filter(([k, v]) => writtenMeta[k] !== v);
    const metaGone = Object.keys(writtenMeta).filter((k) => !(k in meta));
    if (!plan.some((p) => p.upserts.length || p.deletes.length) && !metaChanged.length && !metaGone.length) return;

    await orm.transaction(async (tx) => {
      for (const { spec, upserts, deletes } of plan) {
        for (const keys of chunks(deletes)) {
          const typed = spec.pk.columnType === "PgInteger" ? keys.map(Number) : keys;
          await tx.delete(spec.table).where(inArray(spec.pk, typed));
        }
        for (const rows of chunks(upserts)) {
          await tx.insert(spec.table).values(rows).onConflictDoUpdate({ target: spec.pk, set: excludedSet(spec.table) });
        }
      }
      if (metaGone.length) await tx.delete(schema.meta).where(inArray(schema.meta.key, metaGone));
      for (const [key, value] of metaChanged) {
        await tx.insert(schema.meta).values({ key, value }).onConflictDoUpdate({ target: schema.meta.key, set: { value } });
      }
    });
    for (const { c, after } of plan) written.set(c, after);
    writtenMeta = meta;
  }

  let timer: NodeJS.Timeout | undefined;
  let queue: Promise<void> = Promise.resolve();
  const debounceMs = opts.debounceMs ?? 50;

  const db: Db = {
    data,
    where,
    save() {
      if (timer) return;
      // A failed background write is retried on the next change; it must never crash the server.
      timer = setTimeout(() => {
        timer = undefined;
        db.flush().catch((err) => console.error(`[db] could not save: ${(err as Error).message}`));
      }, debounceMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      // Writes run one at a time, in order.
      const run = queue.then(write);
      queue = run.catch(() => {});
      return run;
    },
    async reset() {
      Object.assign(data, empty(), { genesis: undefined, cursor: undefined });
      await queue;
      await orm.transaction(async (tx) => {
        for (const c of COLLECTIONS) await tx.delete(SPECS[c].table);
        await tx.delete(schema.meta);
      });
      for (const c of COLLECTIONS) written.set(c, new Map());
      writtenMeta = {};
    },
    async close() {
      await db.flush();
      await end();
    },
  };

  return db;
}

/** The embedded Postgres folder for a network and vault, so a new vault starts clean. */
export function pgDirFor(dataDir: string, network: string, vault: AccountId): string {
  return join(dataDir, `pg-${network}-${vault.replace(/[^a-z0-9]+/g, "-")}`);
}

/** Clears data that belongs to another network or vault. */
export async function bindToVault(db: Db, key: string): Promise<boolean> {
  const stale = db.data.genesis !== undefined && db.data.genesis !== key;
  if (stale) await db.reset();
  db.data.genesis = key;
  await db.flush();
  return stale;
}
