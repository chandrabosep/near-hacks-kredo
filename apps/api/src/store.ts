/** Typed accessors over the JSON database. */
import { createHash, randomBytes } from "node:crypto";
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { ActivityEvent, AppRecord, ClaimRecord, Db, HoldRecord, OpRecord, UserRecord, WebhookDelivery } from "./db.js";
import type { PriceList } from "./pricing.js";

export type { ActivityEvent, AppRecord, ClaimRecord, HoldRecord, OpRecord, UserRecord, WebhookDelivery };

const API_KEY_PREFIX = "uc_live_";

export function sha256(value: string): Hex {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

export const hashApiKey = sha256;

const same = (a: string | undefined, b: string | undefined) =>
  a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();

export function createStore(db: Db) {
  const { data } = db;

  return {
    // ---------------------------------------------------------------- apps

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
        prices: {},
        createdAt: Date.now(),
      };
      data.apps.push(app);
      db.save();
      return { app, apiKey };
    },

    removeApp(id: Address) {
      data.apps = data.apps.filter((a) => !same(a.id, id));
      db.save();
    },

    appByApiKey(key: string): AppRecord | undefined {
      const hash = hashApiKey(key);
      return data.apps.find((a) => a.apiKeyHash === hash);
    },

    appById: (id: string) => data.apps.find((a) => same(a.id, id)),

    listApps: () => data.apps,

    setPrices(app: AppRecord, prices: PriceList) {
      app.prices = prices;
      db.save();
    },

    setExchangeRate(app: AppRecord, rate: string | undefined) {
      app.exchangeRate = rate;
      db.save();
    },

    /** Sets the webhook URL and a new signing secret. Returns the secret once. */
    setWebhook(app: AppRecord, url: string | undefined): string | undefined {
      app.webhookUrl = url;
      if (!url) {
        app.webhookSecret = undefined;
        db.save();
        return undefined;
      }
      const secret = `whsec_${randomBytes(24).toString("hex")}`;
      app.webhookSecret = secret;
      db.save();
      return secret;
    },

    // ---------------------------------------------------------------- ops

    addOp(op: OpRecord) {
      data.ops.push(op);
      db.save();
      return op;
    },

    /** An earlier op with this app's own ref, so a retried request returns the first result. */
    opByRef: (app: Address, kind: OpRecord["kind"], ref: string) =>
      data.ops.find((o) => same(o.app, app) && o.kind === kind && o.ref === ref),

    opsForApp: (app: Address) => data.ops.filter((o) => same(o.app, app)),

    /** The op a transaction belongs to, so events can carry the app's own ref. */
    opByTx: (txHash: string) => data.ops.find((o) => o.txHash.toLowerCase() === txHash.toLowerCase()),

    // ---------------------------------------------------------------- holds

    putHold(h: HoldRecord) {
      data.holds.push(h);
      db.save();
    },

    hold: (holdId: string) => data.holds.find((h) => same(h.holdId, holdId)),

    setHoldStatus(holdId: string, status: HoldRecord["status"]) {
      const h = data.holds.find((x) => same(x.holdId, holdId));
      if (h && h.status !== status) {
        h.status = status;
        db.save();
      }
    },

    openHolds: () => data.holds.filter((h) => h.status === "open"),

    // ---------------------------------------------------------------- users

    /** Records a Privy user the first time we see them, and keeps their email current. */
    upsertUser(input: { privyId: string; address: Address; email?: string }): UserRecord {
      let u = data.users.find((x) => x.privyId === input.privyId);
      if (!u) {
        u = { privyId: input.privyId, address: getAddress(input.address), email: input.email, createdAt: Date.now() };
        data.users.push(u);
        db.save();
      } else if (input.email && u.email !== input.email) {
        u.email = input.email;
        db.save();
      }
      return u;
    },

    userByAddress: (address: string) => data.users.find((u) => same(u.address, address)),

    userByPrivyId: (privyId: string) => data.users.find((u) => u.privyId === privyId),

    userByEmail: (email: string) => data.users.find((u) => u.email === email.trim().toLowerCase()),

    // ---------------------------------------------------------------- claims

    putClaim(c: ClaimRecord) {
      data.claims.push(c);
      db.save();
    },

    claim: (claimKey: string) => data.claims.find((c) => same(c.claimKey, claimKey)),

    claimsFrom: (from: Address) => data.claims.filter((c) => same(c.from, from)),

    setClaimStatus(claimKey: string, status: ClaimRecord["status"]) {
      const c = data.claims.find((x) => same(x.claimKey, claimKey));
      if (c && c.status !== status) {
        c.status = status;
        db.save();
      }
    },
  };
}

export type Store = ReturnType<typeof createStore>;
