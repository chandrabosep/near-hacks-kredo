/** Typed accessors over the JSON database. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { ActivityEvent, ApiKeyRecord, AppRecord, ClaimRecord, CompanyRecord, Db, HoldRecord, OpRecord, UserRecord, WebhookDelivery } from "./db.js";
import type { PriceList } from "./pricing.js";
import type { AppProfileInput, CompanyInput } from "./profile.js";

export type { ActivityEvent, ApiKeyRecord, AppRecord, ClaimRecord, CompanyRecord, HoldRecord, OpRecord, UserRecord, WebhookDelivery };

const API_KEY_PREFIX = "uc_live_";
const TEST_KEY_PREFIX = "uc_test_";

export function sha256(value: string): Hex {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

export const hashApiKey = sha256;

const newKey = (mode: ApiKeyRecord["mode"]) => `${mode === "live" ? API_KEY_PREFIX : TEST_KEY_PREFIX}${randomBytes(24).toString("hex")}`;

/** Most active keys an app can hold at once. */
export const MAX_KEYS_PER_APP = 10;
/** Last-used times are kept to the minute, so a busy key doesn't write on every request. */
const LAST_USED_RESOLUTION_MS = 60_000;

const same = (a: string | undefined, b: string | undefined) =>
  a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();

export function createStore(db: Db) {
  const { data } = db;

  /** Sets the given fields; undefined clears an optional one. */
  const assign = <T extends object>(target: T, fields: Partial<T>) => {
    for (const [k, v] of Object.entries(fields)) (target as Record<string, unknown>)[k] = v;
  };

  return {
    // ---------------------------------------------------------------- companies

    companyOwnedBy: (owner: string) => data.companies.find((c) => c.owner === owner),

    companyById: (id: string | undefined) => (id ? data.companies.find((c) => c.id === id) : undefined),

    /** Creates or updates the owner's company. Apps they registered before join it. */
    saveCompany(owner: string, input: CompanyInput): CompanyRecord {
      let company = data.companies.find((c) => c.owner === owner);
      if (company) assign(company, input);
      else {
        company = { id: randomUUID(), owner, createdAt: Date.now(), ...input };
        data.companies.push(company);
      }
      for (const app of data.apps) if (app.owner === owner && !app.companyId) app.companyId = company.id;
      db.save();
      return company;
    },

    // ---------------------------------------------------------------- apps

    /** Creates an app record with a first live key. Returns the key once; only its hash is stored. */
    createApp(input: { name: string; payout: Address; feeBps: number; owner?: string; companyId?: string; profile?: AppProfileInput }): { app: AppRecord; apiKey: string } {
      const app: AppRecord = {
        // A fresh address that only identifies the app onchain. Its key is thrown away.
        id: privateKeyToAccount(generatePrivateKey()).address,
        name: input.name,
        payout: getAddress(input.payout),
        feeBps: input.feeBps,
        prices: {},
        owner: input.owner,
        companyId: input.companyId,
        description: input.profile?.description,
        logoUrl: input.profile?.logoUrl,
        website: input.profile?.website,
        category: input.profile?.category,
        createdAt: Date.now(),
      };
      data.apps.push(app);
      const { key } = this.createKey(app, { mode: "live", name: "Default" });
      return { app, apiKey: key };
    },

    removeApp(id: Address) {
      data.apps = data.apps.filter((a) => !same(a.id, id));
      data.apiKeys = data.apiKeys.filter((k) => !same(k.appId, id));
      db.save();
    },

    appById: (id: string) => data.apps.find((a) => same(a.id, id)),

    appsOwnedBy: (owner: string) => data.apps.filter((a) => a.owner === owner),

    // ---------------------------------------------------------------- API keys

    /** A new named key. Returns it once; only its hash is stored. */
    createKey(app: AppRecord, input: { mode: ApiKeyRecord["mode"]; name: string }): { key: string; record: ApiKeyRecord } {
      const key = newKey(input.mode);
      const record: ApiKeyRecord = {
        id: randomUUID(),
        appId: app.id,
        mode: input.mode,
        name: input.name,
        hash: hashApiKey(key),
        prefix: key.slice(0, API_KEY_PREFIX.length + 6),
        createdAt: Date.now(),
      };
      data.apiKeys.push(record);
      db.save();
      return { key, record };
    },

    keysOf: (app: AppRecord) => data.apiKeys.filter((k) => same(k.appId, app.id)),

    activeKeysOf: (app: AppRecord) => data.apiKeys.filter((k) => same(k.appId, app.id) && !k.revokedAt),

    /** Turns a key off at once. Revoked keys stay listed, so the dashboard shows what happened. */
    revokeKey(app: AppRecord, keyId: string): ApiKeyRecord | undefined {
      const record = data.apiKeys.find((k) => k.id === keyId && same(k.appId, app.id));
      if (record && !record.revokedAt) {
        record.revokedAt = Date.now();
        db.save();
      }
      return record;
    },

    /** The app behind an active key of the given mode, noting when the key was last used. */
    appByKey(key: string, mode: ApiKeyRecord["mode"]): AppRecord | undefined {
      const hash = hashApiKey(key);
      const record = data.apiKeys.find((k) => k.hash === hash && k.mode === mode && !k.revokedAt);
      if (!record) return undefined;
      const now = Date.now();
      if (!record.lastUsedAt || now - record.lastUsedAt >= LAST_USED_RESOLUTION_MS) {
        record.lastUsedAt = now;
        db.save();
      }
      return data.apps.find((a) => same(a.id, record.appId));
    },

    appByApiKey(key: string) {
      return this.appByKey(key, "live");
    },

    appByTestKey(key: string) {
      return this.appByKey(key, "test");
    },

    /** The newest active key's prefix for a mode, for screens that show one key. */
    keyPrefix(app: AppRecord, mode: ApiKeyRecord["mode"]): string | null {
      return this.activeKeysOf(app).filter((k) => k.mode === mode).at(-1)?.prefix ?? null;
    },

    /** A new test key, for fake credits only. Earlier test keys stop working. Returns it once. */
    issueTestKey(app: AppRecord): string {
      for (const k of this.activeKeysOf(app)) if (k.mode === "test") k.revokedAt = Date.now();
      return this.createKey(app, { mode: "test", name: "Test" }).key;
    },

    /** Replaces the live keys with one new key. The old ones stop working at once. Returns it once. */
    rotateApiKey(app: AppRecord): string {
      for (const k of this.activeKeysOf(app)) if (k.mode === "live") k.revokedAt = Date.now();
      return this.createKey(app, { mode: "live", name: "Default" }).key;
    },

    listApps: () => data.apps,

    /** Updates the app's public profile. A missing name keeps the current one. */
    updateAppProfile(app: AppRecord, input: AppProfileInput) {
      const { name, ...rest } = input;
      assign(app, rest);
      if (name) app.name = name;
      db.save();
    },

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
