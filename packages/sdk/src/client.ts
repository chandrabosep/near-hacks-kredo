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
import { randomUUID } from "node:crypto";
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
  /** The network's API. Defaults to https://kredo-api.onrender.com. */
  baseUrl?: string;
  /** The network's hosted pages (connect, buy, wallet). Defaults to https://kredo-omega.vercel.app. */
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
  private appId?: string;
  private appInfo?: { id: string; name: string };
  private readonly retries: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: CreditsOptions) {
    if (!opts.apiKey) throw new Error("Credits: apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://kredo-api.onrender.com").replace(/\/+$/, "");
    this.pagesUrl = (opts.pagesUrl ?? "https://kredo-omega.vercel.app").replace(/\/+$/, "");
    this.retries = opts.retries ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
  }

  // ---------------------------------------------------------------- your app

  /** Your app: payout address, fee, unpaid earnings, prices and webhook. */
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
  user(address: string): Promise<UserState> {
    return this.request("GET", `/v1/users/${encodeURIComponent(address)}`);
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
   * Swaps the one-time code from the connect page for the user's address and email. Call it from
   * your server, then keep both in your own session. Never take an address from the browser.
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
      user: { address: u.user, email: opts.email ?? null, balance: u.balance, connected: u.connected, limit: u.limit, spendable: u.spendable },
    };
  }

  // ---------------------------------------------------------------- money out and reporting

  /** Pays all your unpaid earnings in USDT to your payout address, on Whitechain. */
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

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchFn(url, {
          method,
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
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

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

const backoff = (attempt: number) => 250 * 2 ** attempt;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
