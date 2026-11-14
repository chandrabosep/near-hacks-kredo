/**
 * Buying credits from any chain, through NEAR Intents (the 1Click API).
 *
 * The user picks a token they already hold, say USDC on Base. We ask 1Click for an EXACT_OUTPUT
 * quote: exactly N credits' worth of USDT, delivered to the vault on NEAR. 1Click answers with a
 * deposit address on the user's chain. Once the user pays it, solvers fill the swap and NEAR
 * Intents withdraws the USDT to the vault with
 *
 *   usdt.ft_transfer_call(receiver: vault, msg: {"user": "<their account>"})
 *
 * so the vault's own `ft_on_transfer` credits the user, exactly as a direct deposit would. Nobody
 * holds the money in between, and nothing here is custodial: we only ask for a quote and read status.
 *
 * NEAR Intents has no testnet. On testnet we only ask for dry quotes (real prices, no deposit
 * address); live quotes need the mainnet vault and real USDT (`usdt.tether-token.near`).
 */
import type { AccountId } from "./near.js";

export const ONECLICK_URL = "https://1click.chaindefuser.com";
/** Native USDT on NEAR, the token the mainnet vault holds. */
export const MAINNET_USDT = "usdt.tether-token.near";
/** How long the user has to send their deposit. */
const QUOTE_TTL_MS = 30 * 60_000;
/** 1% slippage on the input side. EXACT_OUTPUT fixes what the vault receives. */
const SLIPPAGE_BPS = 100;
const TOKENS_TTL_MS = 5 * 60_000;
/** Tokens a user is likely to hold. Everything 1Click supports would work; this keeps the list short. */
const PAYABLE_SYMBOLS = new Set(["USDC", "USDT", "ETH", "SOL", "BTC", "wNEAR"]);

export type IntentsToken = {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  price: number;
  contractAddress?: string | null;
};

export type IntentsStatus = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "INCOMPLETE_DEPOSIT" | "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED";

export type BuyQuote = {
  /** False for a dry quote: a real price, but nowhere to pay. */
  live: boolean;
  originAsset: string;
  /** What the user sends, in the origin token's smallest unit and formatted. */
  amountIn: string;
  amountInFormatted: string;
  amountInUsd?: string;
  /** What the vault receives, in USDT units (6 decimals). */
  amountOut: string;
  /** Where to send `amountIn`, and a memo for chains that need one. Only on live quotes. */
  depositAddress?: string;
  depositMemo?: string;
  /** Seconds 1Click expects the swap to take once the deposit lands. */
  timeEstimate?: number;
  deadline: string;
  /** 1Click's signature over the quote. Keep it: it settles any dispute about what was promised. */
  signature?: string;
  correlationId?: string;
};

export type BuyStatus = {
  status: IntentsStatus;
  updatedAt?: string;
  nearTxHashes: string[];
  originTxHashes: string[];
  amountOut?: string;
  refundedAmount?: string;
};

export class IntentsError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "intents_error",
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

export function createIntents(opts: { fetch?: Fetch; baseUrl?: string; jwt?: string; now?: () => number } = {}) {
  const doFetch = opts.fetch ?? fetch;
  const base = (opts.baseUrl ?? ONECLICK_URL).replace(/\/$/, "");
  const now = opts.now ?? Date.now;
  let tokensCache: { at: number; tokens: IntentsToken[] } | undefined;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (opts.jwt) headers.authorization = `Bearer ${opts.jwt}`;
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (err) {
      throw new IntentsError(502, `NEAR Intents is unreachable: ${(err as Error).message}`, "intents_unreachable");
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const message = (json as { message?: string } | undefined)?.message ?? `NEAR Intents answered ${res.status}`;
      // 1Click's 4xx messages name the bad field ("refundTo is not valid"), so they're safe to pass on.
      throw new IntentsError(res.status >= 500 ? 502 : 400, message, res.status >= 500 ? "intents_unavailable" : "intents_rejected");
    }
    return json as T;
  }

  async function tokens(): Promise<IntentsToken[]> {
    if (tokensCache && now() - tokensCache.at < TOKENS_TTL_MS) return tokensCache.tokens;
    const list = await call<IntentsToken[]>("GET", "/v0/tokens");
    tokensCache = { at: now(), tokens: list };
    return list;
  }

  return {
    tokens,

    /** The tokens we offer to pay with, stablecoins first. */
    async payable(): Promise<IntentsToken[]> {
      const list = (await tokens()).filter((t) => PAYABLE_SYMBOLS.has(t.symbol) && !(t.blockchain === "near" && t.contractAddress === MAINNET_USDT));
      const stable = (t: IntentsToken) => (t.symbol === "USDC" || t.symbol === "USDT" ? 0 : 1);
      return list.sort((a, b) => stable(a) - stable(b) || a.blockchain.localeCompare(b.blockchain) || a.symbol.localeCompare(b.symbol));
    },

    /**
     * Quotes exactly `units` of USDT (6 decimals) into `vault`, credited to `user`.
     * `dry` gets a real price without a deposit address, so nothing can be paid.
     */
    async quote(q: {
      originAsset: string;
      units: bigint;
      user: AccountId;
      vault: AccountId;
      usdt: AccountId;
      /** An address on the paying chain, or with `refundType: "INTENTS"` a NEAR Intents account. */
      refundTo: string;
      refundType?: "ORIGIN_CHAIN" | "INTENTS";
      dry: boolean;
    }): Promise<BuyQuote> {
      if (q.units <= 0n) throw new IntentsError(400, "Nothing to buy", "zero_amount");
      const deadline = new Date(now() + QUOTE_TTL_MS).toISOString();
      const request = {
        dry: q.dry,
        swapType: "EXACT_OUTPUT",
        slippageTolerance: SLIPPAGE_BPS,
        originAsset: q.originAsset,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: `nep141:${q.usdt}`,
        amount: q.units.toString(),
        recipient: q.vault,
        recipientType: "DESTINATION_CHAIN",
        // NEAR Intents withdraws with ft_transfer_call and this msg, so the vault credits `user`.
        customRecipientMsg: depositMsg(q.user),
        refundTo: q.refundTo,
        refundType: q.refundType ?? "ORIGIN_CHAIN",
        deadline,
      };
      type Raw = {
        correlationId?: string;
        signature?: string;
        quote: {
          amountIn: string;
          amountInFormatted: string;
          amountInUsd?: string;
          amountOut: string;
          depositAddress?: string;
          depositMemo?: string;
          timeEstimate?: number;
          deadline?: string;
        };
      };
      const raw = await call<Raw>("POST", "/v0/quote", request);
      const out = BigInt(raw.quote.amountOut);
      // EXACT_OUTPUT: the vault must get what we asked for. Anything less would credit the user less
      // than they were shown, so refuse rather than pass it on.
      if (out < q.units) throw new IntentsError(502, `Quote delivers ${out} units, below the ${q.units} asked for`, "short_quote");
      if (!q.dry && !raw.quote.depositAddress) throw new IntentsError(502, "NEAR Intents returned no deposit address", "no_deposit_address");
      return {
        live: !q.dry,
        originAsset: q.originAsset,
        amountIn: raw.quote.amountIn,
        amountInFormatted: raw.quote.amountInFormatted,
        amountInUsd: raw.quote.amountInUsd,
        amountOut: raw.quote.amountOut,
        depositAddress: raw.quote.depositAddress,
        depositMemo: raw.quote.depositMemo,
        timeEstimate: raw.quote.timeEstimate,
        deadline: raw.quote.deadline ?? deadline,
        signature: raw.signature,
        correlationId: raw.correlationId,
      };
    },

    /** Where a live quote's swap is: waiting for the deposit, swapping, done or refunded. */
    async status(depositAddress: string, depositMemo?: string): Promise<BuyStatus> {
      const qs = new URLSearchParams({ depositAddress });
      if (depositMemo) qs.set("depositMemo", depositMemo);
      type Raw = {
        status: IntentsStatus;
        updatedAt?: string;
        swapDetails?: {
          nearTxHashes?: string[];
          originChainTxHashes?: { hash: string }[];
          amountOut?: string;
          refundedAmount?: string;
        };
      };
      const raw = await call<Raw>("GET", `/v0/status?${qs}`);
      const d = raw.swapDetails ?? {};
      return {
        status: raw.status,
        updatedAt: raw.updatedAt,
        nearTxHashes: d.nearTxHashes ?? [],
        originTxHashes: (d.originChainTxHashes ?? []).map((t) => t.hash),
        amountOut: d.amountOut,
        refundedAmount: d.refundedAmount,
      };
    },

    /** Tells 1Click about a deposit, so it doesn't wait to notice it. Optional. */
    async submitDeposit(depositAddress: string, txHash: string, depositMemo?: string): Promise<void> {
      await call("POST", "/v0/deposit/submit", { depositAddress, txHash, ...(depositMemo ? { memo: depositMemo } : {}) });
    },
  };
}

/** The `msg` the vault's `ft_on_transfer` reads to credit someone other than the sender. */
export function depositMsg(user: AccountId): string {
  return JSON.stringify({ user });
}

/** True once a swap can't change any more. */
export function settled(status: IntentsStatus): boolean {
  return status === "SUCCESS" || status === "REFUNDED" || status === "FAILED";
}

export type Intents = ReturnType<typeof createIntents>;
