/** Routes anyone can call: health, live reserves, the app directory and claim link previews. */
import { Router } from "express";
import { formatEther } from "viem";
import { explorerAddress } from "../chain.js";
import type { Context } from "../context.js";
import { HttpError } from "../http.js";
import { amount } from "../units.js";
import { addressSchema } from "./shared.js";

export function publicRoutes(ctx: Context): Router {
  const r = Router();
  const { config } = ctx;

  r.get("/health", async (_req, res) => {
    const [block, balance] = await Promise.all([ctx.publicClient.getBlockNumber(), ctx.relayer.balance()]);
    res.json({
      ok: true,
      chainId: config.chainId,
      block: Number(block),
      vault: config.vault,
      usdt: config.usdt,
      relayer: { address: ctx.relayer.operator, balance: formatEther(balance), symbol: ctx.chain.nativeCurrency.symbol },
      login: ctx.verifier ? "privy" : "disabled",
      indexer: ctx.indexer.status(),
    });
  });

  /** Network totals from the indexed events. */
  r.get("/stats", (_req, res) => {
    let deposited = 0n;
    let spent = 0n;
    let fees = 0n;
    let paidOut = 0n;
    let refunded = 0n;
    const users = new Set<string>();
    for (const e of ctx.db.data.events) {
      if (e.event === "Deposited") deposited += e.units ?? 0n;
      if (e.event === "Charged" || e.event === "Captured") {
        spent += e.units ?? 0n;
        fees += e.fee ?? 0n;
      }
      if (e.event === "PaidOut") paidOut += e.units ?? 0n;
      if (e.event === "Refunded") refunded += e.units ?? 0n;
      if (e.user) users.add(e.user.toLowerCase());
    }
    res.json({
      apps: ctx.store.listApps().length,
      users: users.size,
      events: ctx.db.data.events.length,
      deposited: amount(deposited),
      spent: amount(spent),
      networkFees: amount(fees),
      refunded: amount(refunded),
      paidOut: amount(paidOut),
      indexedToBlock: ctx.indexer.status().block,
    });
  });

  /** Every credit is backed: the vault's USDT next to everything it owes. */
  r.get("/reserves", async (_req, res) => {
    const v = ctx.vault.read;
    const [[backed, held, owed], balances, holds, claims, earnings, fees] = await Promise.all([
      v.checkBacking(),
      v.totalBalances(),
      v.totalHeld(),
      v.totalClaims(),
      v.totalEarnings(),
      v.protocolFees(),
    ]);
    res.json({
      backed,
      usdtInVault: amount(held),
      owed: amount(owed),
      surplus: amount(held - owed),
      breakdown: {
        userBalances: amount(balances),
        held: amount(holds),
        claimLinks: amount(claims),
        companyEarnings: amount(earnings),
        networkFees: amount(fees),
      },
      vault: config.vault,
      explorer: explorerAddress(ctx.chain, config.vault),
    });
  });

  /** Every app that accepts credits, with its prices. */
  r.get("/directory", (_req, res) => {
    res.json(
      ctx.store.listApps().map((a) => ({
        id: a.id,
        name: a.name,
        prices: a.prices,
        exchangeRate: a.exchangeRate ?? null,
      })),
    );
  });

  /** What a claim link holds, before the recipient signs in. */
  r.get("/claims/:claimKey", async (req, res) => {
    const claimKey = addressSchema.parse(req.params.claimKey);
    const c = await ctx.vault.read.getClaim([claimKey]);
    if (c.status === 0) throw new HttpError(404, "No such claim link", "not_found");
    const status = ["none", "open", "claimed", "cancelled"][c.status];
    const expired = status === "open" && Number(c.expiry) <= Math.floor(Date.now() / 1000);
    res.json({
      claimKey,
      amount: amount(c.amount),
      status: expired ? "expired" : status,
      expiresAt: new Date(Number(c.expiry) * 1000).toISOString(),
    });
  });

  return r;
}
