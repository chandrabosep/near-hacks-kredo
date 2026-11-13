/**
 * Server kit for a company backend. Keep the API key on your server, never in a browser.
 *
 *   const credits = new Credits({ apiKey: process.env.CREDITS_API_KEY });
 *
 *   await credits.charge({ user, action: "chat.message" });
 *
 *   const hold = await credits.hold({ user, action: "video.render", quantity: 12 });
 *   // ...run the job...
 *   await credits.capture(hold.holdId);        // or credits.release(hold.holdId)
 */
import { createPrivateKey, randomUUID, sign as ed25519Sign } from "node:crypto";
import { CreditsError } from "./errors.js";
import type {
  ActivityItem,
  Amount,
  CreditsSession,
  AmountInput,
  AppInfo,
  AppProfileInput,
  Capture,
  Conversion,
  Credits as CreditAmount,
  GasReport,
  Hold,
  HoldStatus,
  Operation,
  Payout,
  PriceList,
  PriceListInput,
  Quote,
  UserState,
  WebhookDelivery,
} from "./types.js";

export type CreditsOptions = {
  /** Your app's API key, `uc_live_...`. */
  apiKey: string;
  /**
   * Your app's signing key, `ed25519:...`: the function-call key on your app's signer account.
   * Live charges, holds, captures, releases and refunds are signed with it on your server, so
   * only your app can charge for your app. Kredo never sees it; its relayer only pays the gas.
   */
  signerKey?: string;
  /** The network's API. Defaults to https://kredo-near-api.onrender.com. */
  baseUrl?: string;
  /** The network's hosted pages (connect, buy, wallet). Defaults to https://kredo-near.vercel.app. */
  pagesUrl?: string;
  /** Extra tries after a network failure or a rate limit. Writes are safe to retry: each carries a ref. Default 2. */
  retries?: number;
  /** Per-request timeout. Default 60s, long enough for a transaction to confirm. */
  timeoutMs?: number;
  fetch?: typeof fetch;
};

type Query = Record<string, string | number | undefined>;

/** Longest wait we'll sit through for a rate limit before giving up and throwing. */
const MAX_RETRY_WAIT_MS = 10_000;

export class Credits {
  readonly baseUrl: string;
  readonly pagesUrl: string;
  private readonly apiKey: string;
  private readonly signerKey?: string;
  private readonly signerPublicKey?: string;
  private appId?: string;
  private appInfo?: { id: string; name: string };
  private readonly retries: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: CreditsOptions) {
    if (!opts.apiKey) throw new Error("Credits: apiKey is required");
    this.apiKey = opts.apiKey;
    this.signerKey = opts.signerKey;
    this.signerPublicKey = opts.signerKey ? publicKeyOf(opts.signerKey) : undefined;
    this.baseUrl = (opts.baseUrl ?? "https://kredo-near-api.onrender.com").replace(/\/+$/, "");
    this.pagesUrl = (opts.pagesUrl ?? "https://kredo-near.vercel.app").replace(/\/+$/, "");
    this.retries = opts.retries ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  // ---------------------------------------------------------------- your app

  /** Your app: payout account, fee, unpaid earnings, prices and webhook. */
  async app(): Promise<AppInfo> {
    const app = await this.request<AppInfo>("GET", "/v1/app");
    this.appId = app.id;
    return app;
  }

  prices(): Promise<PriceList> {
    return this.request("GET", "/v1/prices");
  }

  /** Replaces your price list, in credits: `{ "chat.message": { price: 2 }, "video.render": { rate: 8, unit: "second" } }`. */
  setPrices(prices: PriceListInput): Promise<PriceList> {
    return this.request("PUT", "/v1/prices", { body: { prices } });
  }

  /** Sets how your app appears in the Kredo directory: name, description, logo, website and category. */
  setProfile(profile: AppProfileInput): Promise<AppProfileInput & { id: string; name: string }> {
    return this.request("PATCH", "/v1/profile", { body: profile });
  }

  // ---------------------------------------------------------------- prices and users

  /** What an action costs the user, and what you keep after the network fee. Show it before the job starts. */
  quote(input: AmountInput): Promise<Quote> {
    return this.request("GET", "/v1/quote", { query: amountQuery(input) });
  }

  /** A user's balance, whether they've connected your app, and the most you can charge them now. */
  user(account: string): Promise<UserState> {
    return this.request("GET", `/v1/users/${encodeURIComponent(account)}`);
  }

  // ---------------------------------------------------------------- charging

  /**
   * Charges the user now. Pass your own `ref` (an order or message id) to make retries safe:
   * the same ref always returns the first result. Throws a CreditsError with `isDeclined` when
   * the user's limit or balance doesn't cover it.
   */
  charge(input: { user: string; ref?: string } & AmountInput): Promise<Operation> {
    return this.request("POST", "/v1/charges", { body: withRef(input) });
  }

  /** Reserves credits at the start of a long job. The price is locked now. Capture or release it when the job ends. */
  hold(input: { user: string; ref?: string; ttlSeconds?: number } & AmountInput): Promise<Hold> {
    return this.request("POST", "/v1/holds", { body: withRef(input) });
  }

  getHold(holdId: string): Promise<HoldStatus> {
    return this.request("GET", `/v1/holds/${encodeURIComponent(holdId)}`);
  }

  /** The job succeeded. Charges the whole hold, or only `credits` of it, and returns the rest to the user. */
  capture(holdId: string, opts: { credits?: CreditAmount } = {}): Promise<Capture> {
    return this.request("POST", `/v1/holds/${encodeURIComponent(holdId)}/capture`, { body: opts });
  }

  /** The job failed. Everything held goes back to the user. */
  release(holdId: string): Promise<Operation> {
    return this.request("POST", `/v1/holds/${encodeURIComponent(holdId)}/release`, { body: {} });
  }

  /** Gives credits back, up to what this user has spent with you. Comes out of your unpaid earnings. */
  refund(input: { user: string; credits: CreditAmount; ref?: string }): Promise<Operation> {
    return this.request("POST", "/v1/refunds", { body: withRef(input) });
  }

  // ---------------------------------------------------------------- light mode

  /** Light mode: how many of our credits buy one of yours. Pass null to turn it off. */
  setExchangeRate(rate: CreditAmount | null): Promise<{ exchangeRate: string | null }> {
    return this.request("PUT", "/v1/exchange-rate", { body: { rate } });
  }

  /** Light mode: spends `credits` of ours. Add the returned `appCredits` to the user's balance in your own system. */
  convert(input: { user: string; credits: CreditAmount; ref?: string }): Promise<Conversion> {
    return this.request("POST", "/v1/convert", { body: withRef(input) });
  }

  // ---------------------------------------------------------------- connecting users

  /**
   * A link to the network's connect page. The user signs in with email, approves a spending
   * limit for your app, and comes back to `returnTo`. Nobody can charge them until they do.
   */
  async connectUrl(opts: { credits: CreditAmount; returnTo?: string; expiresInDays?: number }): Promise<string> {
    const app = this.appId ?? (await this.app()).id;
    return this.page("/connect", { app, credits: String(opts.credits), days: opts.expiresInDays, returnTo: opts.returnTo });
  }

  /** A link to the buy page, for a user who is out of credits. */
  buyUrl(opts: { credits?: CreditAmount; returnTo?: string } = {}): string {
    return this.page("/buy", { credits: opts.credits === undefined ? undefined : String(opts.credits), returnTo: opts.returnTo });
  }

  /** The user's account page, where they see their balance and can disconnect any app. */
  accountUrl(): string {
    return this.page("/account", {});
  }

  /** @deprecated Use accountUrl(). */
  walletUrl(): string {
    return this.accountUrl();
  }

  /**
   * Swaps the one-time code from the connect page for the user's NEAR account and email. Call it from
   * your server, then keep both in your own session. Never take an account from the browser.
   */
  exchangeCode(code: string): Promise<{ user: string; email: string | null; limit: Amount }> {
    return this.request("POST", "/v1/connect/exchange", { body: { code } });
  }

  /**
   * What the React kit shows for one of your users: your app, and their balance and limit.
   * Pass undefined for a visitor who hasn't connected yet, and the email from `exchangeCode()` to
   * show it in the UI.
   */
  async session(user: string | undefined, opts: { email?: string | null } = {}): Promise<CreditsSession> {
    const app = this.appInfo ?? (this.appInfo = await this.app().then((a) => ({ id: a.id, name: a.name })));
    if (!user) return { app, user: null };
    const u = await this.user(user);
    return {
      app,
      user: { account: u.user, email: opts.email ?? null, balance: u.balance, connected: u.connected, limit: u.limit, spendable: u.spendable },
    };
  }

  // ---------------------------------------------------------------- money out and reporting

  /** Pays all your unpaid earnings in USDT to your payout account, on NEAR. */
  payout(): Promise<Payout> {
    return this.request("POST", "/v1/payout", { body: {} });
  }

  /** Every vault event for your app, newest first. */
  activity(opts: { limit?: number } = {}): Promise<ActivityItem[]> {
    return this.request("GET", "/v1/activity", { query: { limit: opts.limit } });
  }

  /** Charges, holds, refunds and payouts as CSV text, for your accountant. */
  exportCsv(): Promise<string> {
    return this.request("GET", "/v1/export.csv", { raw: true });
  }

  /** Gas the network spent on your transactions. You never pay it: the network fee covers it. */
  gas(opts: { since?: Date } = {}): Promise<GasReport> {
    return this.request("GET", "/v1/gas", { query: { since: opts.since?.toISOString() } });
  }

  /**
   * Sends every event about your app to `url` as a signed POST. Returns the signing secret once;
   * check each delivery with `verifyWebhook`. Pass null to stop.
   */
  setWebhook(url: string | null): Promise<{ url: string | null; secret: string | null }> {
    return this.request("PUT", "/v1/webhook", { body: { url } });
  }

  webhookDeliveries(): Promise<WebhookDelivery[]> {
    return this.request("GET", "/v1/webhook/deliveries");
  }

  // ---------------------------------------------------------------- transport

  private page(path: string, params: Query): string {
    const url = new URL(this.pagesUrl + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    return url.toString();
  }

  /** @internal Shared by every call. Retries network failures and rate limits; throws CreditsError. */
  async request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; raw?: boolean } = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

    let signature: string | undefined;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchFn(url, {
          method,
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
            ...(this.signerPublicKey === undefined ? {} : { "x-kredo-signer-key": this.signerPublicKey }),
            ...(signature === undefined ? {} : { "x-kredo-signature": signature }),
          },
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (attempt < this.retries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new CreditsError(`Couldn't reach ${this.baseUrl}: ${(err as Error).message}`, 0, "network");
      }

      if (res.status === 429 && attempt < this.retries) {
        const wait = Number(res.headers.get("retry-after")) * 1000 || backoff(attempt);
        if (wait <= MAX_RETRY_WAIT_MS) {
          await sleep(wait);
          continue;
        }
      }

      if (opts.raw && res.ok) return (await res.text()) as T;
      const text = await res.text();
      const data = text ? safeJson(text) : undefined;
      // The API prepared this write as a transaction from your app's signer: sign its hash and
      // send the same request again. The body and ref are unchanged, so it matches what was prepared.
      const sign = data as { code?: string; hash?: string } | undefined;
      if (res.status === 428 && sign?.code === "signature_required" && sign.hash && signature === undefined) {
        if (!this.signerKey) {
          throw new CreditsError("This app signs its own charges: pass signerKey (your app's ed25519 key) to Credits", 428, "missing_signer");
        }
        signature = `${sign.hash}:${signHash(this.signerKey, sign.hash)}`;
        attempt--;
        continue;
      }
      if (!res.ok) {
        const d = (data ?? {}) as { error?: string; code?: string; txHash?: string };
        throw new CreditsError(d.error ?? `HTTP ${res.status}`, res.status, d.code ?? "error", d.txHash);
      }
      return data as T;
    }
  }
}

function amountQuery(input: AmountInput): Query {
  return {
    action: input.action,
    quantity: input.quantity === undefined ? undefined : String(input.quantity),
    credits: input.credits === undefined ? undefined : String(input.credits),
  };
}

/** Every write carries a ref, so a retry after a dropped connection can never charge twice. */
function withRef<T extends { ref?: string }>(input: T): T & { ref: string } {
  return { ...input, ref: input.ref ?? randomUUID() };
}

/** The public half of a NEAR `ed25519:<base58>` secret key (seed then public key), as `ed25519:<base58>`. */
function publicKeyOf(secretKey: string): string {
  const [curve, encoded] = secretKey.split(":");
  const bytes = curve === "ed25519" && encoded ? base58Decode(encoded) : Buffer.alloc(0);
  if (bytes.length !== 64) throw new CreditsError("signerKey must look like ed25519:<base58>, as near-cli stores it", 0, "bad_signer_key");
  return `ed25519:${base58Encode(bytes.subarray(32))}`;
}

/** Signs a prepared transaction hash with a NEAR `ed25519:<base58>` secret key. Returns hex. */
function signHash(secretKey: string, hashHex: string): string {
  const [curve, encoded] = secretKey.split(":");
  if (curve !== "ed25519" || !encoded) throw new CreditsError("signerKey must look like ed25519:<base58>", 0, "bad_signer_key");
  const seed = base58Decode(encoded).subarray(0, 32);
  if (seed.length !== 32) throw new CreditsError("signerKey is too short", 0, "bad_signer_key");
  // PKCS#8 DER prefix for a raw ed25519 private key seed.
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const key = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  return ed25519Sign(null, Buffer.from(hashHex.replace(/^0x/, ""), "hex"), key).toString("hex");
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

function base58Decode(s: string): Buffer {
  let n = 0n;
  for (const c of s) {
    const i = BASE58.indexOf(c);
    if (i < 0) throw new CreditsError("signerKey isn't valid base58", 0, "bad_signer_key");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Buffer.from(bytes);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

const backoff = (attempt: number) => 250 * 2 ** attempt;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
