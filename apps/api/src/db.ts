/**
 * Tiny JSON-file database for what the chain doesn't hold: API keys, hold metadata and the
 * relayer's gas ledger. The chain is the source of truth for every balance.
 *
 * Writes are debounced and atomic (temp file + rename), so a crash never leaves a half-written
 * file. bigint values survive the round trip.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Address, Hash, Hex } from "viem";

export type AppRecord = {
  /** The app's id address onchain. Only an identifier: nobody holds its key. */
  id: Address;
  name: string;
  payout: Address;
  feeBps: number;
  /** sha256 of the API key. The key itself is shown once, at creation. */
  apiKeyHash: Hex;
  /** First characters of the key, so the dashboard can show which key is which. */
  apiKeyPrefix: string;
  createdAt: number;
};

export type HoldRecord = {
  holdId: Hex;
  app: Address;
  user: Address;
  units: bigint;
  ref: Hex;
  label: string;
  expiry: number;
  status: "open" | "captured" | "released";
  txHash: Hash;
};

/** What the relayer paid for one transaction, in wei of the gas token. */
export type RelayerTx = {
  hash?: Hash;
  fn: string;
  status: "pending" | "success" | "reverted" | "failed";
  gasUsed: bigint;
  l2Fee: bigint;
  l1Fee: bigint;
  error?: string;
  at: number;
};

export type Data = {
  /** Hash of block 0. A local chain restarts with a new genesis, which makes this file stale. */
  genesis?: Hash;
  apps: AppRecord[];
  holds: HoldRecord[];
  txs: RelayerTx[];
};

export type Db = {
  data: Data;
  file: string;
  /** Schedules a write. Cheap to call after every change. */
  save(): void;
  /** Writes now. */
  flush(): void;
  /** Clears everything, for a replaced local chain. */
  reset(): void;
};

const empty = (): Data => ({ apps: [], holds: [], txs: [] });

const replacer = (_key: string, v: unknown) => (typeof v === "bigint" ? { $bigint: v.toString() } : v);
const reviver = (_key: string, v: unknown) =>
  v !== null && typeof v === "object" && "$bigint" in v ? BigInt((v as { $bigint: string }).$bigint) : v;

export function openDb(file: string, debounceMs = 50): Db {
  mkdirSync(dirname(file), { recursive: true });
  const data: Data = existsSync(file)
    ? { ...empty(), ...(JSON.parse(readFileSync(file, "utf8"), reviver) as Partial<Data>) }
    : empty();

  let timer: NodeJS.Timeout | undefined;

  const db: Db = {
    data,
    file,
    save() {
      if (!timer) timer = setTimeout(db.flush, debounceMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(data, replacer, 2));
      renameSync(tmp, file);
    },
    reset() {
      Object.assign(data, empty(), { genesis: undefined });
      db.flush();
    },
  };
  return db;
}

/** One file per chain and vault, so a fresh local deploy starts with a clean slate. */
export function dbFileFor(dataDir: string, chainId: number, vault: Address): string {
  return join(dataDir, `db-${chainId}-${vault.slice(2, 10).toLowerCase()}.json`);
}

/** Wipes the file if it belongs to an earlier local chain with a different genesis block. */
export function bindToGenesis(db: Db, genesis: Hash): boolean {
  const stale = db.data.genesis !== undefined && db.data.genesis !== genesis;
  if (stale) db.reset();
  db.data.genesis = genesis;
  db.flush();
  return stale;
}
