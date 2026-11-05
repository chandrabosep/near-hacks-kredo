/**
 * Operator-only routes, guarded by ADMIN_TOKEN. Registers apps until the company dashboard
 * takes over sign-up, and backs the dev scripts and demo apps.
 */
import { Router } from "express";
import { z } from "zod";
import { creditVaultAbi } from "../abi/CreditVault.js";
import type { Context } from "../context.js";
import { requireAdmin } from "../http.js";
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
    const feeBps = body.feeBps ?? config.networkFeeBps;
    const maxCharge = body.maxCharge === undefined ? 0n : creditsToUnits(body.maxCharge);
    const { app, apiKey } = store.createApp({ name: body.name, payout: body.payout, feeBps });
    try {
      const { hash } = await relayer.write(
        {
          address: config.vault,
          abi: creditVaultAbi,
          functionName: "registerApp",
          args: [app.id, app.payout, feeBps, maxCharge],
        },
        { app: app.id },
      );
      res.status(201).json({
        id: app.id,
        name: app.name,
        payout: app.payout,
        feeBps,
        maxCharge: maxCharge === 0n ? null : amount(maxCharge),
        apiKey,
        ...txInfo(ctx, hash),
      });
    } catch (err) {
      store.removeApp(app.id);
      throw err;
    }
  });

  r.get("/apps", (_req, res) => {
    res.json(
      store.listApps().map((a) => ({
        id: a.id,
        name: a.name,
        payout: a.payout,
        feeBps: a.feeBps,
        apiKeyPrefix: a.apiKeyPrefix,
        createdAt: new Date(a.createdAt).toISOString(),
      })),
    );
  });

  /** The relayer's gas position: balance, spend today and transaction count. */
  r.get("/ops", async (_req, res) => {
    const dayAgo = Date.now() - 86_400_000;
    const [balance] = await Promise.all([relayer.balance()]);
    const today = relayer.spent(dayAgo);
    const all = relayer.spent();
    res.json({
      relayer: relayer.operator,
      balanceWei: balance.toString(),
      last24h: { transactions: today.count, wei: today.wei.toString() },
      allTime: { transactions: all.count, wei: all.wei.toString() },
      daysOfRunway: today.wei === 0n ? null : Number(balance / today.wei),
    });
  });

  return r;
}
