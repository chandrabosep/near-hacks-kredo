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
import type { AmountInput, Capture, Credits as CreditAmount, Hold, HoldStatus, Operation, Quote, UserState } from "./types.js";

export type CreditsOptions = {
  /** Your app's API key, `uc_live_...`. */
  apiKey: string;
  /** The network's API. Defaults to http://localhost:4000. */
  baseUrl?: string;
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
  private readonly apiKey: string;
  private readonly retries: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: CreditsOptions) {
    if (!opts.apiKey) throw new Error("Credits: apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "http://localhost:4000").replace(/\/+$/, "");
    this.retries = opts.retries ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.fetchFn = opts.fetch ?? globalThis.fetch;
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

  // ---------------------------------------------------------------- transport

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
