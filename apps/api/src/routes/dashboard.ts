/**
 * The company dashboard's API. A company owner signs in with the same email login as users,
 * registers apps, and then manages each one with every company route under /v1/me/apps/:id
 * (prices, payout, activity, CSV, gas, webhooks), authorised by ownership instead of an API key.
 */
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { Context } from "../context.js";
import { MAX_KEYS_PER_APP, type ApiKeyRecord, type CompanyRecord } from "../store.js";
import { HttpError, requireUser, userOf } from "../http.js";
import { appProfileSchema, companySchema } from "../profile.js";
import { registerApp } from "../register.js";
import { amount } from "../units.js";
import { appRoutes } from "./app.js";
import { accountIdSchema, appProfile, txInfo } from "./shared.js";

const MAX_APPS_PER_OWNER = 5;

const createSchema = appProfileSchema.extend({
  name: z.string().trim().min(2).max(60),
  /** Where earnings are paid. Defaults to the owner's own wallet. */
  payout: accountIdSchema.optional(),
});

export function dashboardRoutes(ctx: Context): Router {
  const r = Router();
  const { store, config } = ctx;

  const signedIn = requireUser(ctx.verifier, store, config.signupsPerIpPerHour);
  r.use("/me/apps", signedIn);
  r.use("/me/company", signedIn);

  const owner = (res: Parameters<typeof userOf>[0]) => userOf(res).privyId;

  /** The signed-in owner's company profile. */
  r.get("/me/company", (_req, res) => {
    const company = store.companyOwnedBy(owner(res));
    if (!company) throw new HttpError(404, "Set up your company first", "no_company");
    res.json(companyJson(company));
  });

  /** Creates or updates the company profile. Users see it in the directory and on the connect page. */
  r.put("/me/company", (req, res) => {
    res.json(companyJson(store.saveCompany(owner(res), companySchema.parse(req.body))));
  });

  /** Registers an app onchain. The network pays the gas. The API key is shown only here. */
  r.post("/me/apps", async (req, res) => {
    const body = createSchema.parse(req.body);
    const company = store.companyOwnedBy(owner(res));
    if (!company) throw new HttpError(409, "Set up your company first", "no_company");
    if (store.appsOwnedBy(owner(res)).length >= MAX_APPS_PER_OWNER) {
      throw new HttpError(409, `You can register up to ${MAX_APPS_PER_OWNER} apps`, "too_many_apps");
    }
    const { app, apiKey, hash } = await registerApp(ctx, {
      name: body.name,
      payout: body.payout ?? userOf(res).address,
      owner: owner(res),
      companyId: company.id,
      profile: { description: body.description, logoUrl: body.logoUrl, website: body.website, category: body.category },
    });
    res.status(201).json({ id: app.id, name: app.name, payout: app.payout, feeBps: app.feeBps, apiKey, testKey: store.issueTestKey(app), ...txInfo(ctx, hash) });
  });

  /** The owner's apps, with what each has earned and not yet withdrawn. */
  r.get("/me/apps", async (_req, res) => {
    const apps = store.appsOwnedBy(owner(res));
    const earnings = await Promise.all(apps.map((a) => ctx.vault.earningsOf(a.id)));
    res.json(
      apps.map((a, i) => ({
        id: a.id,
        name: a.name,
        payout: a.payout,
        feeBps: a.feeBps,
        apiKeyPrefix: store.keyPrefix(a, "live"),
        unpaidEarnings: amount(earnings[i]),
        prices: a.prices,
        createdAt: new Date(a.createdAt).toISOString(),
        ...appProfile(ctx, a),
      })),
    );
  });

  const ownApp: RequestHandler = (req, res, next) => {
    const app = store.appById(String(req.params.id));
    if (!app || app.owner !== owner(res)) return next(new HttpError(404, "No such app on your account", "not_found"));
    res.locals.app = app;
    next();
  };

  /** Updates the app's name, description, logo, website or category. */
  r.patch("/me/apps/:id/profile", ownApp, (req, res) => {
    const app = res.locals.app;
    store.updateAppProfile(app, appProfileSchema.parse(req.body));
    res.json({ id: app.id, name: app.name, ...appProfile(ctx, app) });
  });

  /** A new API key. The old one stops working at once. */
  r.post("/me/apps/:id/key", ownApp, (_req, res) => {
    const app = res.locals.app;
    const apiKey = store.rotateApiKey(app);
    res.json({ apiKey, apiKeyPrefix: store.keyPrefix(app, "live") });
  });

  /** A test key: the same calls against fake credits, nothing onchain. */
  r.post("/me/apps/:id/test-key", ownApp, (_req, res) => {
    const app = res.locals.app;
    const testKey = store.issueTestKey(app);
    res.json({ testKey, testKeyPrefix: store.keyPrefix(app, "test") });
  });

  /** Every key the app has had: live and test, active and revoked. Never the keys themselves. */
  r.get("/me/apps/:id/keys", ownApp, (_req, res) => {
    res.json(store.keysOf(res.locals.app).map(keyJson).reverse());
  });

  /** A new named key, shown once. */
  r.post("/me/apps/:id/keys", ownApp, (req, res) => {
    const app = res.locals.app;
    const body = keySchema.parse(req.body);
    if (store.activeKeysOf(app).length >= MAX_KEYS_PER_APP) {
      throw new HttpError(409, `An app can have up to ${MAX_KEYS_PER_APP} active keys. Revoke one first.`, "too_many_keys");
    }
    const { key, record } = store.createKey(app, body);
    res.status(201).json({ ...keyJson(record), key });
  });

  /** Turns a key off at once. */
  r.delete("/me/apps/:id/keys/:keyId", ownApp, (req, res) => {
    const record = store.revokeKey(res.locals.app, String(req.params.keyId));
    if (!record) throw new HttpError(404, "No such key on this app", "not_found");
    res.json(keyJson(record));
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
      gas: { transactions: gas.count, yocto: gas.yocto.toString(), symbol: "NEAR" },
    });
  });

  // Every company route, for an app this owner holds. Ownership is checked here, where :id is
  // visible; the nested router then sees res.locals.app already set.
  const alreadyChecked: RequestHandler = (_req, _res, next) => next();
  r.use("/me/apps/:id", ownApp, appRoutes(ctx, alreadyChecked));

  return r;
}

const keySchema = z.object({
  name: z.string().trim().min(1).max(40),
  mode: z.enum(["live", "test"]),
});

function keyJson(k: ApiKeyRecord) {
  const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : null);
  return { id: k.id, name: k.name, mode: k.mode, prefix: k.prefix, createdAt: iso(k.createdAt), lastUsedAt: iso(k.lastUsedAt), revokedAt: iso(k.revokedAt) };
}

function companyJson(c: CompanyRecord) {
  return {
    id: c.id,
    name: c.name,
    logoUrl: c.logoUrl ?? null,
    website: c.website ?? null,
    category: c.category ?? null,
    supportEmail: c.supportEmail ?? null,
    createdAt: new Date(c.createdAt).toISOString(),
  };
}
