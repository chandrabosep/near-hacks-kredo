/**
 * Routes a company's backend calls with its API key. Every write accepts the company's own
 * `ref`. Repeating a request with the same ref returns the first result instead of charging again.
 */
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import type { Context } from "../context.js";
import { appOf, HttpError, rateLimit, requireApiKey } from "../http.js";
import { formatNear, TGAS } from "../near.js";
import { amountInputSchema, priceListSchema, resolveAmount } from "../pricing.js";
import { appProfileSchema } from "../profile.js";
import type { OpRecord } from "../store.js";
import { RelayerError, vaultEvent } from "../relayer.js";
import { amount, creditsToUnits, unitsToCreditsString, UNITS_PER_CREDIT } from "../units.js";
import { accountIdSchema, activityFor, appProfile, creditsSchema, forApp, newRef, onchainRef, refSchema, txInfo } from "./shared.js";

const chargeSchema = z.intersection(
  amountInputSchema,
  z.object({ user: accountIdSchema, ref: refSchema.optional() }),
);
const holdSchema = z.intersection(
  amountInputSchema,
  z.object({ user: accountIdSchema, ref: refSchema.optional(), ttlSeconds: z.number().int().min(60).optional() }),
);
const captureSchema = z.object({ credits: creditsSchema.optional() });
const refundSchema = z.object({ user: accountIdSchema, credits: creditsSchema, ref: refSchema.optional() });
const convertSchema = z.object({ user: accountIdSchema, credits: creditsSchema, ref: refSchema.optional() });

/**
 * `auth` decides which app a request is for: the API key by default, or the signed-in owner on
 * the company dashboard (mounted at /v1/me/apps/:id).
 */
export function appRoutes(ctx: Context, auth?: RequestHandler): Router {
  const r = Router();
  const { store, relayer, config, vault } = ctx;

  r.use(auth ?? requireApiKey(store), rateLimit(config.rateLimitPerMin));

  const fee = (units: bigint, feeBps: number) => (units * BigInt(feeBps)) / 10_000n;

  function opView(op: OpRecord) {
    return {
      kind: op.kind,
      ref: op.ref,
      user: op.user,
      amount: amount(op.units),
      fee: op.fee === undefined ? undefined : amount(op.fee),
      label: op.label,
      holdId: op.holdId,
      at: new Date(op.at).toISOString(),
      ...txInfo(ctx, op.txHash),
    };
  }

  const replay = (op: OpRecord) => ({ ...opView(op), replayed: true });

  /**
   * NEAR can't dry-run a call that changes state, so the common failures are checked with views
   * first: a charge the user can't cover never costs gas.
   */
  async function precheck(user: string, appId: string, units: bigint) {
    const [balance, limit] = await Promise.all([vault.balanceOf(user), vault.limitOf(user, appId)]);
    if (limit.expiry !== 0 && limit.expiry <= Math.floor(Date.now() / 1000)) throw new RelayerError("LimitExpired");
    if (units > limit.remaining) throw new RelayerError("OverLimit");
    if (units > balance) throw new RelayerError("InsufficientBalance");
  }

  const limitView = (limit: { remaining: bigint; expiry: number }) => {
    const expired = limit.expiry !== 0 && limit.expiry <= Math.floor(Date.now() / 1000);
    return { remaining: expired ? 0n : limit.remaining, expiresAt: limit.expiry === 0 ? null : new Date(limit.expiry * 1000).toISOString() };
  };

  // ---------------------------------------------------------------- app and prices

  r.get("/app", async (_req, res) => {
    const app = appOf(res);
    const [onchain, earnings] = await Promise.all([vault.getApp(app.id), vault.earningsOf(app.id)]);
    res.json({
      id: app.id,
      name: app.name,
      payout: onchain?.payout ?? app.payout,
      feeBps: onchain?.feeBps ?? app.feeBps,
      maxCharge: !onchain || onchain.maxCharge === 0n ? null : amount(onchain.maxCharge),
      active: onchain?.active ?? false,
      unpaidEarnings: amount(earnings),
      prices: app.prices,
      exchangeRate: app.exchangeRate ?? null,
      webhookUrl: app.webhookUrl ?? null,
      apiKeyPrefix: ctx.store.keyPrefix(app, "live"),
      testKeyPrefix: ctx.store.keyPrefix(app, "test"),
      ...appProfile(ctx, app),
    });
  });

  /** Updates the app's name, description, logo, website or category, as the directory shows them. */
  r.patch("/profile", (req, res) => {
    const app = appOf(res);
    ctx.store.updateAppProfile(app, appProfileSchema.parse(req.body));
    res.json({ id: app.id, name: app.name, ...appProfile(ctx, app) });
  });

  r.get("/prices", (_req, res) => res.json(appOf(res).prices));

  r.put("/prices", (req, res) => {
    const prices = priceListSchema.parse(req.body?.prices ?? req.body);
    store.setPrices(appOf(res), prices);
    res.json(prices);
  });

  /** What an action costs the user, and what the company keeps after the network fee. */
  r.get("/quote", (req, res) => {
    const app = appOf(res);
    const input = amountInputSchema.parse(req.query);
    const { units, label } = resolveAmount(input, app.prices);
    const f = fee(units, app.feeBps);
    res.json({ label, price: amount(units), networkFee: amount(f), youEarn: amount(units - f) });
  });

  // ---------------------------------------------------------------- users

  /** A user's balance and how much this app may still charge them. */
  r.get("/users/:account", async (req, res) => {
    const app = appOf(res);
    const user = accountIdSchema.parse(req.params.account);
    const [balance, limit] = await Promise.all([vault.balanceOf(user), vault.limitOf(user, app.id)]);
    const { remaining, expiresAt } = limitView(limit);
    res.json({
      user,
      balance: amount(balance),
      connected: remaining > 0n,
      limit: amount(remaining),
      limitExpiresAt: expiresAt,
      spendable: amount(balance < remaining ? balance : remaining),
    });
  });

  /**
   * Swaps the code from the connect page for the user's NEAR account and email. Each code works once.
   * The email is shared here only, after the user approved this app on the connect page.
   */
  r.post("/connect/exchange", async (req, res) => {
    const app = appOf(res);
    const { code } = z.object({ code: z.string().min(8).max(200) }).parse(req.body);
    const user = ctx.codes.redeem(app.id, code);
    if (!user) throw new HttpError(400, "That code is invalid, used or expired. Ask the user to connect again.", "bad_code");
    const limit = await vault.limitOf(user, app.id);
    res.json({ user, email: store.userByAddress(user)?.email ?? null, limit: amount(limitView(limit).remaining) });
  });

  // ---------------------------------------------------------------- charges

  r.post("/charges", async (req, res) => {
    const app = appOf(res);
    const body = chargeSchema.parse(req.body);
    const ref = body.ref ?? newRef();
    const earlier = store.opByRef(app.id, "charge", ref);
    if (earlier) return void res.json(replay(earlier));

    const { units, label } = resolveAmount(body, app.prices);
    atLeast(units, config.minChargeUnits);
    await precheck(body.user, app.id, units);
    const result = await relayer.write(
      { method: "charge", args: { user: body.user, app: app.id, amount: units.toString(), ref_id: onchainRef("charge", ref) } },
      { app: app.id },
    );
    const { hash } = result;
    const ev = vaultEvent(result, "charged");
    const op = store.addOp({
      app: app.id,
      kind: "charge",
      ref,
      user: body.user,
      units,
      fee: BigInt(String(ev.fee)),
      label,
      txHash: hash,
      at: Date.now(),
    });
    res.status(201).json(opView(op));
  });

  // ---------------------------------------------------------------- holds

  /** Reserve credits at the start of a long job. The price is locked now. */
  r.post("/holds", async (req, res) => {
    const app = appOf(res);
    const body = holdSchema.parse(req.body);
    const ref = body.ref ?? newRef();
    const earlier = store.opByRef(app.id, "hold", ref);
    if (earlier) return void res.json(replay(earlier));

    const { units, label } = resolveAmount(body, app.prices);
    atLeast(units, config.minChargeUnits);
    const ttl = Math.min(body.ttlSeconds ?? config.holdTtlSeconds, config.holdTtlSeconds);
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    await precheck(body.user, app.id, units);
    const result = await relayer.write(
      {
        method: "hold",
        args: { user: body.user, app: app.id, amount: units.toString(), ref_id: onchainRef("hold", ref), expiry },
      },
      { app: app.id },
    );
    const { hash } = result;
    const holdId = String(vaultEvent(result, "held").hold_id);
    store.putHold({
      holdId,
      app: app.id,
      user: body.user,
      units,
      ref: onchainRef("hold", ref),
      label,
      expiry,
      status: "open",
      txHash: hash,
    });
    const op = store.addOp({ app: app.id, kind: "hold", ref, user: body.user, units, label, holdId, txHash: hash, at: Date.now() });
    res.status(201).json({ ...opView(op), holdId, expiresAt: new Date(expiry * 1000).toISOString() });
  });

  function holdOf(app: string, holdId: string) {
    const h = store.hold(holdId);
    if (!h || h.app !== app) throw new HttpError(404, "No such hold for this app", "not_found");
    return h;
  }

  r.get("/holds/:holdId", async (req, res) => {
    const h = holdOf(appOf(res).id, req.params.holdId);
    res.json({
      holdId: h.holdId,
      user: h.user,
      amount: amount(h.units),
      label: h.label,
      status: h.status,
      expiresAt: new Date(h.expiry * 1000).toISOString(),
      ...txInfo(ctx, h.txHash),
    });
  });

  /** The job succeeded. Charge all of the hold, or `credits` of it, and return the rest. */
  r.post("/holds/:holdId/capture", async (req, res) => {
    const app = appOf(res);
    const h = holdOf(app.id, req.params.holdId);
    const earlier = store.opByRef(app.id, "capture", h.holdId);
    if (earlier) return void res.json(replay(earlier));

    const body = captureSchema.parse(req.body ?? {});
    const actual = body.credits === undefined ? h.units : creditsToUnits(body.credits);
    if (actual > h.units) throw new HttpError(400, "Can't capture more than was held", "over_held");
    const result = await relayer.write({ method: "capture", args: { hold_id: h.holdId, actual: actual.toString() } }, { app: app.id });
    const { hash } = result;
    const ev = vaultEvent(result, "captured");
    store.setHoldStatus(h.holdId, "captured");
    const op = store.addOp({
      app: app.id,
      kind: "capture",
      ref: h.holdId,
      user: h.user,
      units: actual,
      fee: BigInt(String(ev.fee)),
      label: h.label,
      holdId: h.holdId,
      txHash: hash,
      at: Date.now(),
    });
    res.json({ ...opView(op), returned: amount(BigInt(String(ev.returned))) });
  });

  /** The job failed. Everything held goes back to the user. */
  r.post("/holds/:holdId/release", async (req, res) => {
    const app = appOf(res);
    const h = holdOf(app.id, req.params.holdId);
    const earlier = store.opByRef(app.id, "release", h.holdId);
    if (earlier) return void res.json(replay(earlier));

    const { hash } = await relayer.write({ method: "release", args: { hold_id: h.holdId } }, { app: app.id });
    store.setHoldStatus(h.holdId, "released");
    const op = store.addOp({
      app: app.id,
      kind: "release",
      ref: h.holdId,
      user: h.user,
      units: h.units,
      label: h.label,
      holdId: h.holdId,
      txHash: hash,
      at: Date.now(),
    });
    res.json(opView(op));
  });

  // ---------------------------------------------------------------- refunds

  r.post("/refunds", async (req, res) => {
    const app = appOf(res);
    const body = refundSchema.parse(req.body);
    const ref = body.ref ?? newRef();
    const earlier = store.opByRef(app.id, "refund", ref);
    if (earlier) return void res.json(replay(earlier));

    const units = creditsToUnits(body.credits);
    const { hash } = await relayer.write(
      { method: "refund", args: { app: app.id, user: body.user, amount: units.toString(), ref_id: onchainRef("refund", ref) } },
      { app: app.id },
    );
    const op = store.addOp({ app: app.id, kind: "refund", ref, user: body.user, units, txHash: hash, at: Date.now() });
    res.status(201).json(opView(op));
  });

  // ---------------------------------------------------------------- light mode

  /** How many of our credits buy one of the app's own credits. */
  r.put("/exchange-rate", (req, res) => {
    const { rate } = z.object({ rate: creditsSchema.nullable() }).parse(req.body);
    if (rate === null) {
      store.setExchangeRate(appOf(res), undefined);
      return void res.json({ exchangeRate: null });
    }
    const units = creditsToUnits(rate);
    if (units === 0n) throw new HttpError(400, "rate must be more than 0", "invalid_request");
    const normalised = unitsToCreditsString(units);
    store.setExchangeRate(appOf(res), normalised);
    res.json({ exchangeRate: normalised });
  });

  /** Light mode: spend our credits, and the app tops up its own credit balance for the user. */
  r.post("/convert", async (req, res) => {
    const app = appOf(res);
    if (!app.exchangeRate) throw new HttpError(400, "Set an exchange rate first: PUT /v1/exchange-rate", "no_rate");
    const body = convertSchema.parse(req.body);
    const ref = body.ref ?? newRef();
    const earlier = store.opByRef(app.id, "convert", ref);
    if (earlier) return void res.json(replay(earlier));

    const units = creditsToUnits(body.credits);
    atLeast(units, config.minChargeUnits);
    const rateUnits = creditsToUnits(app.exchangeRate);
    // App credits, exact to 4 decimals: units / rateUnits, scaled back up by UNITS_PER_CREDIT.
    const appCredits = unitsToCreditsString((units * UNITS_PER_CREDIT) / rateUnits);
    await precheck(body.user, app.id, units);
    const result = await relayer.write(
      { method: "charge", args: { user: body.user, app: app.id, amount: units.toString(), ref_id: onchainRef("convert", ref) } },
      { app: app.id },
    );
    const { hash } = result;
    const ev = vaultEvent(result, "charged");
    const label = `converted to ${appCredits} ${app.name} credits`;
    const op = store.addOp({
      app: app.id,
      kind: "convert",
      ref,
      user: body.user,
      units,
      fee: BigInt(String(ev.fee)),
      label,
      txHash: hash,
      at: Date.now(),
    });
    res.status(201).json({ ...opView(op), appCredits });
  });

  // ---------------------------------------------------------------- payouts, gas, webhooks, export

  /** Pays all unpaid earnings in USDT to the app's payout account. */
  r.post("/payout", async (_req, res) => {
    const app = appOf(res);
    if ((await vault.earningsOf(app.id)) === 0n) throw new RelayerError("ZeroAmount");
    // payout sends USDT with ft_transfer, then a callback puts the earnings back if that fails.
    const result = await relayer.write({ method: "payout", args: { app: app.id }, gas: 100n * TGAS }, { app: app.id });
    const { hash } = result;
    if (result.events.some((e) => e.event === "payout_failed")) throw new RelayerError("PayoutFailed", hash);
    const ev = vaultEvent(result, "paid_out");
    const paid = BigInt(String(ev.amount));
    const op = store.addOp({ app: app.id, kind: "payout", units: paid, txHash: hash, at: Date.now() });
    res.json({ ...opView(op), to: String(ev.to), usdt: amount(paid).usd });
  });

  /** Gas the relayer spent on this app's transactions. Covered by the network fee. */
  r.get("/gas", (req, res) => {
    const app = appOf(res);
    const since = req.query.since ? Date.parse(String(req.query.since)) : 0;
    if (Number.isNaN(since)) throw new HttpError(400, "since must be a date", "invalid_request");
    const { count, yocto } = relayer.spent(since, app.id);
    res.json({
      transactions: count,
      yocto: yocto.toString(),
      gas: formatNear(yocto, 8),
      symbol: "NEAR",
      paidBy: "network",
    });
  });

  /** Every vault event for this app, newest first. */
  r.get("/activity", (req, res) => {
    res.json(activityFor(ctx, forApp(appOf(res).id), req.query.limit));
  });

  /** Recent webhook deliveries, so a company can see what reached it. */
  r.get("/webhook/deliveries", (_req, res) => {
    const app = appOf(res);
    res.json(
      ctx.db.data.deliveries
        .filter((d) => d.app === app.id)
        .slice(-50)
        .reverse()
        .map((d) => ({ id: d.id, type: d.type, status: d.status, attempts: d.attempts, lastStatus: d.lastStatus ?? null, lastError: d.lastError ?? null })),
    );
  });

  r.put("/webhook", (req, res) => {
    const { url } = z.object({ url: z.url().nullable() }).parse(req.body);
    const secret = store.setWebhook(appOf(res), url ?? undefined);
    res.json({ url, secret: secret ?? null });
  });

  r.get("/export.csv", (_req, res) => {
    const app = appOf(res);
    const rows = [["date", "kind", "ref", "user", "credits", "usd", "fee_credits", "label", "tx"]];
    for (const op of store.opsForApp(app.id)) {
      rows.push([
        new Date(op.at).toISOString(),
        op.kind,
        op.ref ?? "",
        op.user ?? "",
        unitsToCreditsString(op.units),
        amount(op.units).usd,
        op.fee === undefined ? "" : unitsToCreditsString(op.fee),
        op.label ?? "",
        op.txHash,
      ]);
    }
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="${slug(app.name)}-activity.csv"`);
    res.send(rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n");
  });

  return r;
}

/** Dust charges would only burn relayer gas. */
function atLeast(units: bigint, min: bigint) {
  if (units < min) throw new HttpError(400, `The smallest charge is ${unitsToCreditsString(min)} credits`, "below_minimum");
}

function csvCell(v: string): string {
  // Quote, and neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) || safe !== v ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
}
