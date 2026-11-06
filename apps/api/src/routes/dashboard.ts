/**
 * The company dashboard's API. A company owner signs in with the same email login as users,
 * registers apps, and then manages each one with every company route under /v1/me/apps/:id
 * (prices, payout, activity, CSV, gas, webhooks), authorised by ownership instead of an API key.
 */
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { Context } from "../context.js";
import { HttpError, requireUser, userOf } from "../http.js";
import { registerApp } from "../register.js";
import { amount } from "../units.js";
import { appRoutes } from "./app.js";
import { addressSchema, txInfo } from "./shared.js";

const MAX_APPS_PER_OWNER = 5;

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  /** Where earnings are paid. Defaults to the owner's own wallet. */
  payout: addressSchema.optional(),
});

export function dashboardRoutes(ctx: Context): Router {
  const r = Router();
  const { store, config } = ctx;

  r.use("/me/apps", requireUser(ctx.verifier, store, config.signupsPerIpPerHour));

  const owner = (res: Parameters<typeof userOf>[0]) => userOf(res).privyId;

  /** Registers an app onchain. The network pays the gas. The API key is shown only here. */
  r.post("/me/apps", async (req, res) => {
    const body = createSchema.parse(req.body);
    if (store.appsOwnedBy(owner(res)).length >= MAX_APPS_PER_OWNER) {
      throw new HttpError(409, `You can register up to ${MAX_APPS_PER_OWNER} apps`, "too_many_apps");
    }
    const { app, apiKey, hash } = await registerApp(ctx, {
      name: body.name,
      payout: body.payout ?? userOf(res).address,
      owner: owner(res),
    });
    res.status(201).json({ id: app.id, name: app.name, payout: app.payout, feeBps: app.feeBps, apiKey, testKey: store.issueTestKey(app), ...txInfo(ctx, hash) });
  });

  /** The owner's apps, with what each has earned and not yet withdrawn. */
  r.get("/me/apps", async (_req, res) => {
    const apps = store.appsOwnedBy(owner(res));
    const earnings = await Promise.all(apps.map((a) => ctx.vault.read.earningsOf([a.id])));
    res.json(
      apps.map((a, i) => ({
        id: a.id,
        name: a.name,
        payout: a.payout,
        feeBps: a.feeBps,
        apiKeyPrefix: a.apiKeyPrefix,
        unpaidEarnings: amount(earnings[i]),
        prices: a.prices,
        createdAt: new Date(a.createdAt).toISOString(),
      })),
    );
  });

  const ownApp: RequestHandler = (req, res, next) => {
    const app = store.appById(String(req.params.id));
    if (!app || app.owner !== owner(res)) return next(new HttpError(404, "No such app on your account", "not_found"));
    res.locals.app = app;
    next();
  };

  /** A new API key. The old one stops working at once. */
  r.post("/me/apps/:id/key", ownApp, (_req, res) => {
    const app = res.locals.app;
    res.json({ apiKey: store.rotateApiKey(app), apiKeyPrefix: app.apiKeyPrefix });
  });

  /** A test key: the same calls against fake credits, nothing onchain. */
  r.post("/me/apps/:id/test-key", ownApp, (_req, res) => {
    const app = res.locals.app;
    res.json({ testKey: store.issueTestKey(app), testKeyPrefix: app.testKeyPrefix });
  });

  /** Revenue, fees and refunds for one app, from the indexed events. */
  r.get("/me/apps/:id/stats", ownApp, (_req, res) => {
    const id = String(res.locals.app.id).toLowerCase();
    let revenue = 0n;
    let fees = 0n;
    let refunded = 0n;
    let paidOut = 0n;
    let charges = 0;
    const users = new Set<string>();
    for (const e of ctx.db.data.events) {
      if (e.app?.toLowerCase() !== id) continue;
      if (e.event === "Charged" || e.event === "Captured") {
        revenue += e.units ?? 0n;
        fees += e.fee ?? 0n;
        charges++;
        if (e.user) users.add(e.user.toLowerCase());
      }
      if (e.event === "Refunded") refunded += e.units ?? 0n;
      if (e.event === "PaidOut") paidOut += e.units ?? 0n;
    }
    const gas = ctx.relayer.spent(0, res.locals.app.id);
    res.json({
      revenue: amount(revenue),
      networkFees: amount(fees),
      refunded: amount(refunded),
      earned: amount(revenue - fees - refunded),
      paidOut: amount(paidOut),
      charges,
      payingUsers: users.size,
      gas: { transactions: gas.count, wei: gas.wei.toString(), symbol: ctx.chain.nativeCurrency.symbol },
    });
  });

  // Every company route, for an app this owner holds. Ownership is checked here, where :id is
  // visible; the nested router then sees res.locals.app already set.
  const alreadyChecked: RequestHandler = (_req, _res, next) => next();
  r.use("/me/apps/:id", ownApp, appRoutes(ctx, alreadyChecked));

  return r;
}
