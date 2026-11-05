/** Typed accessors over the JSON database. */
import { createHash, randomBytes } from "node:crypto";
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { AppRecord, Db, HoldRecord } from "./db.js";

export type { AppRecord, HoldRecord };

const API_KEY_PREFIX = "uc_live_";

export function hashApiKey(key: string): Hex {
  return `0x${createHash("sha256").update(key).digest("hex")}`;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function createStore(db: Db) {
  const { data } = db;

  return {
    /** Creates an app record. Returns the API key once; only its hash is stored. */
    createApp(input: { name: string; payout: Address; feeBps: number }): { app: AppRecord; apiKey: string } {
      const apiKey = `${API_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
      const app: AppRecord = {
        // A fresh address that only identifies the app onchain. Its key is thrown away.
        id: privateKeyToAccount(generatePrivateKey()).address,
        name: input.name,
        payout: getAddress(input.payout),
        feeBps: input.feeBps,
        apiKeyHash: hashApiKey(apiKey),
        apiKeyPrefix: apiKey.slice(0, API_KEY_PREFIX.length + 6),
        createdAt: Date.now(),
      };
      data.apps.push(app);
      db.save();
      return { app, apiKey };
    },

    appByApiKey(key: string): AppRecord | undefined {
      const hash = hashApiKey(key);
      return data.apps.find((a) => a.apiKeyHash === hash);
    },

    appById: (id: Address) => data.apps.find((a) => same(a.id, id)),

    listApps: () => data.apps,

    putHold(h: HoldRecord) {
      data.holds.push(h);
      db.save();
    },

    hold: (holdId: Hex) => data.holds.find((h) => same(h.holdId, holdId)),

    setHoldStatus(holdId: Hex, status: HoldRecord["status"]) {
      const h = data.holds.find((x) => same(x.holdId, holdId));
      if (h && h.status !== status) {
        h.status = status;
        db.save();
      }
    },

    openHolds: () => data.holds.filter((h) => h.status === "open"),
  };
}

export type Store = ReturnType<typeof createStore>;
