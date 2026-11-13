/** Routes anyone can call: health, live reserves, the app directory and claim link previews. */
import { Router } from "express";
import { explorerAccount, formatNear } from "../near.js";
import type { Context } from "../context.js";
import { HttpError } from "../http.js";
import { amount } from "../units.js";
import { appProfile, claimKeySchema } from "./shared.js";

export function publicRoutes(ctx: Context): Router {
  const r = Router();
  const { config } = ctx;

  r.get("/health", async (_req, res) => {
    const [head, balance] = await Promise.all([ctx.chain.head(), ctx.relayer.balance()]);
    res.json({
      ok: true,
      network: config.network,
      block: head.height,
      vault: config.vault,
      usdt: config.usdt,
      relayer: { account: ctx.relayer.operator, balance: formatNear(balance), symbol: "NEAR" },
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
      if (e.user) users.add(e.user);
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
    const { backed, held, owed, totals } = await ctx.indexer.checkBacking();
    res.json({
      backed,
      usdtInVault: amount(held),
      owed: amount(owed),
      surplus: amount(held - owed),
      breakdown: {
        userBalances: amount(totals.balances),
        held: amount(totals.held),
        claimLinks: amount(totals.claims),
        companyEarnings: amount(totals.earnings),
        networkFees: amount(totals.fees),
      },
      vault: config.vault,
      usdt: config.usdt,
      explorer: explorerAccount(config.explorerUrl, config.vault),
    });
  });

  /** Every app that accepts credits, with its prices. */
  r.get("/directory", (_req, res) => {
    // Usage per app, from onchain events: how many charges, and how many people paid.
    const usage = new Map<string, { charges: number; users: Set<string>; lastAt: number }>();
    for (const e of ctx.db.data.events) {
      if ((e.event !== "Charged" && e.event !== "Captured") || !e.app) continue;
      const u = usage.get(e.app) ?? { charges: 0, users: new Set<string>(), lastAt: 0 };
      u.charges += 1;
      if (e.user) u.users.add(e.user);
      u.lastAt = Math.max(u.lastAt, e.at);
      usage.set(e.app, u);
    }
    res.json(
      ctx.store.listApps().map((a) => ({
        id: a.id,
        name: a.name,
        prices: a.prices,
        exchangeRate: a.exchangeRate ?? null,
        ...appProfile(ctx, a),
        usage: (() => {
          const u = usage.get(a.id);
          return { charges: u?.charges ?? 0, payingUsers: u?.users.size ?? 0, lastChargeAt: u?.lastAt ? new Date(u.lastAt).toISOString() : null };
        })(),
        listedAt: new Date(a.createdAt).toISOString(),
      })),
    );
  });

  /** What a claim link holds, before the recipient signs in. */
  r.get("/claims/:claimKey", async (req, res) => {
    const claimKey = claimKeySchema.parse(req.params.claimKey);
    const c = await ctx.vault.getClaim(claimKey);
    if (!c) throw new HttpError(404, "No such claim link", "not_found");
    const status = c.status.toLowerCase();
    const expired = status === "open" && c.expiry <= Math.floor(Date.now() / 1000);
    res.json({
      claimKey,
      amount: amount(c.amount),
      status: expired ? "expired" : status,
      expiresAt: new Date(Number(c.expiry) * 1000).toISOString(),
    });
  });

  return r;
}
