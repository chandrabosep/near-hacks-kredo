/**
 * Operator-only routes, guarded by ADMIN_TOKEN. Registers apps until the company dashboard
 * takes over sign-up, and backs the dev scripts and demo apps.
 */
import { Router } from "express";
import { z } from "zod";
import { creditVaultAbi } from "../abi/CreditVault.js";
import type { Context } from "../context.js";
import { HttpError, requireAdmin } from "../http.js";
import { registerApp } from "../register.js";
import { amount, creditsToUnits } from "../units.js";
import { addressSchema, creditsSchema, txInfo } from "./shared.js";

const createAppSchema = z.object({
  name: z.string().trim().min(2).max(60),
  payout: addressSchema,
  feeBps: z.number().int().min(0).max(2_000).optional(),
  /** Largest single charge or hold, in credits. Omit for no cap. */
  maxCharge: creditsSchema.optional(),
});

export function adminRoutes(ctx: Context): Router {
  const r = Router();
  const { store, relayer, config } = ctx;

  r.use(requireAdmin(config.adminToken));

  /** Registers an app onchain and returns its API key. The key is shown only here. */
  r.post("/apps", async (req, res) => {
    const body = createAppSchema.parse(req.body);
    const maxCharge = body.maxCharge === undefined ? 0n : creditsToUnits(body.maxCharge);
    const { app, apiKey, hash } = await registerApp(ctx, { name: body.name, payout: body.payout, feeBps: body.feeBps, maxCharge });
    res.status(201).json({
      id: app.id,
      name: app.name,
      payout: app.payout,
      feeBps: app.feeBps,
      maxCharge: maxCharge === 0n ? null : amount(maxCharge),
      apiKey,
      testKey: ctx.store.issueTestKey(app),
      ...txInfo(ctx, hash),
    });
  });

  /**
   * Takes an app off the network: turned off in the vault, so it can't charge or hold any more,
   * then dropped from the directory with its keys. Refunds and payouts of what it already earned
   * still work onchain.
   */
  r.delete("/apps/:id", async (req, res) => {
    const id = addressSchema.parse(req.params.id);
    const app = store.appById(id);
    if (!app) throw new HttpError(404, "No app with that id", "unknown_app");
    const { hash } = await relayer.write({ address: config.vault, abi: creditVaultAbi, functionName: "setAppActive", args: [app.id, false] }, { app: app.id });
    store.removeApp(app.id);
    res.json({ id: app.id, name: app.name, removed: true, ...txInfo(ctx, hash) });
  });

  r.get("/apps", (_req, res) => {
    res.json(
      store.listApps().map((a) => ({
        id: a.id,
        name: a.name,
        payout: a.payout,
        feeBps: a.feeBps,
        apiKeyPrefix: ctx.store.keyPrefix(a, "live"),
        createdAt: new Date(a.createdAt).toISOString(),
      })),
    );
  });

  /** The relayer's gas position: balance, spend today and transaction count. */
  r.get("/ops", async (_req, res) => {
    const { balance, today, limits, budgetLeft, exitsOnly } = await relayer.status();
    const all = relayer.spent();
    res.json({
      relayer: relayer.operator,
      balanceWei: balance.toString(),
      last24h: { transactions: today.count, wei: today.wei.toString() },
      allTime: { transactions: all.count, wei: all.wei.toString() },
      daysOfRunway: today.wei === 0n ? null : Number(balance / today.wei),
      exitsOnly,
      indexer: ctx.indexer.status(),
      limits: limits && {
        dailyBudgetWei: limits.dailyBudget.toString(),
        budgetLeftWei: budgetLeft?.toString(),
        appDailyBudgetWei: limits.appDailyBudget.toString(),
        minBalanceWei: limits.minBalance.toString(),
        maxTxGas: limits.maxTxGas.toString(),
        maxGasPriceWei: limits.maxGasPrice.toString(),
      },
    });
  });

  return r;
}
