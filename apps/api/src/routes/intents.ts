/**
 * Buy credits from any chain, through NEAR Intents.
 *
 *   GET  /v1/intents/assets         tokens a user can pay with (public)
 *   POST /v1/me/intents/quote       { originAsset, credits, refundTo } -> a deposit address and price
 *   GET  /v1/me/intents/status      ?depositAddress= -> where the swap is, and the user's balance
 *
 * On mainnet a quote is live: the API first registers the user's vault storage (NEP-145, paid by
 * the relayer) so the vault will accept the deposit, then asks 1Click for a deposit address. On
 * testnet, where NEAR Intents doesn't exist, quotes are dry: real prices, nowhere to pay.
 */
import { Router } from "express";
import { z } from "zod";
import type { Context } from "../context.js";
import { HttpError, requireUser, userOf } from "../http.js";
import { createIntents, IntentsError, settled, type BuyQuote, type Intents } from "../intents.js";
import { explorerTx, type AccountId } from "../near.js";
import { amount, creditsToUnits } from "../units.js";
import { creditsSchema } from "./shared.js";

const DEFAULT_MAX_CREDITS = 10_000; // $100

const quoteBody = z.object({
  originAsset: z.string().min(3).max(200),
  credits: creditsSchema,
  refundTo: z.string().min(2).max(200),
});

export function intentsRoutes(ctx: Context, opts: { intents?: Intents; env?: Record<string, string | undefined> } = {}): Router {
  const r = Router();
  const { config, chain, relayer, store } = ctx;
  const env = opts.env ?? process.env;
  const intents = opts.intents ?? createIntents({ jwt: env.ONECLICK_JWT || undefined });
  // Live quotes move real money, so they're on only where the vault holds real USDT.
  const live = (env.INTENTS_LIVE ?? (config.network === "mainnet" ? "true" : "false")) === "true";
  const maxCredits = Number(env.INTENTS_MAX_CREDITS ?? DEFAULT_MAX_CREDITS);
  /** Live quotes by deposit address, so a user can only follow their own. Lost on restart, which only loses the check. */
  const quotes = new Map<string, { user: AccountId; quote: BuyQuote }>();

  const wrap = (err: unknown) => (err instanceof IntentsError ? new HttpError(err.status, err.message, err.code) : err);

  /** Registers `user` with the vault (NEP-145) so it accepts their deposit. The relayer pays. */
  async function ensureVaultStorage(user: AccountId) {
    const registered = await chain.view<unknown>(config.vault, "storage_balance_of", { account_id: user });
    if (registered !== null) return;
    const bounds = await chain.view<{ min: string }>(config.vault, "storage_balance_bounds");
    await relayer.write({ method: "storage_deposit", args: { account_id: user, registration_only: true }, deposit: BigInt(bounds.min) });
  }

  r.get("/intents/assets", async (_req, res, next) => {
    try {
      const tokens = await intents.payable();
      res.json({
        live,
        network: config.network,
        assets: tokens.map((t) => ({ assetId: t.assetId, symbol: t.symbol, chain: t.blockchain, decimals: t.decimals, priceUsd: t.price })),
      });
    } catch (err) {
      next(wrap(err));
    }
  });

  r.use("/me/intents", requireUser(ctx.verifier, store, config.signupsPerIpPerHour));

  r.post("/me/intents/quote", async (req, res, next) => {
    try {
      const body = quoteBody.parse(req.body);
      const units = creditsToUnits(body.credits);
      if (units < creditsToUnits(1)) throw new HttpError(400, "The smallest purchase is 1 credit.", "below_minimum");
      if (units > creditsToUnits(maxCredits)) throw new HttpError(400, `The most one purchase can be is ${maxCredits} credits.`, "above_maximum");
      const user = userOf(res).address;
      if (live) await ensureVaultStorage(user);
      const quote = await intents.quote({ originAsset: body.originAsset, units, user, vault: config.vault, usdt: config.usdt, refundTo: body.refundTo, dry: !live });
      if (quote.depositAddress) quotes.set(quote.depositAddress, { user, quote });
      res.json({
        ...quote,
        credits: amount(units),
        network: config.network,
        // Plain words for the page, so it never implies a dry quote can be paid.
        note: live
          ? "Send exactly amountIn to depositAddress before the deadline. Credits arrive once the swap settles on NEAR."
          : "Preview only: NEAR Intents runs on mainnet, and this server is on testnet. The price is real; there is nowhere to pay.",
      });
    } catch (err) {
      next(wrap(err));
    }
  });

  r.get("/me/intents/status", async (req, res, next) => {
    try {
      const depositAddress = z.string().min(3).max(200).parse(req.query.depositAddress);
      const user = userOf(res).address;
      const known = quotes.get(depositAddress);
      if (known && known.user !== user) throw new HttpError(404, "No purchase with that deposit address.", "not_found");
      const s = await intents.status(depositAddress, known?.quote.depositMemo);
      const balance = settled(s.status) ? await ctx.vault.balanceOf(user) : undefined;
      res.json({
        ...s,
        settled: settled(s.status),
        nearTxs: s.nearTxHashes.map((hash) => ({ hash, url: explorerTx(config.explorerUrl, hash) })),
        balance: balance === undefined ? undefined : amount(balance),
      });
    } catch (err) {
      next(wrap(err));
    }
  });

  return r;
}
