/**
 * Company calls made with a test API key (`uc_test_...`). Same paths and response shapes as live
 * calls, answered from the in-memory sandbox instead of the chain, with `test: true` on every
 * response. Requests with a live key skip this router entirely.
 */
import { Router, type RequestHandler } from "express";
import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";
import type { Context } from "../context.js";
import { HttpError, appOf } from "../http.js";
import { amountInputSchema, resolveAmount } from "../pricing.js";
import { createSandbox } from "../sandbox.js";
import { amount, creditsToUnits } from "../units.js";
import { addressSchema, creditsSchema, newRef, onchainRef, refSchema } from "./shared.js";

const TEST_PREFIX = "uc_test_";

const chargeSchema = z.intersection(amountInputSchema, z.object({ user: addressSchema, ref: refSchema.optional() }));
const holdSchema = z.intersection(
  amountInputSchema,
  z.object({ user: addressSchema, ref: refSchema.optional(), ttlSeconds: z.number().int().min(60).optional() }),
);

export function testRoutes(ctx: Context): Router {
  const r = Router();
  const { store, config } = ctx;
  const sandbox = createSandbox();
  /** First results by app, kind and ref, so a retried test call replays like a live one. */
  const results = new Map<string, unknown>();

  const requireTestKey: RequestHandler = (req, res, next) => {
    const h = req.header("authorization");
    const key = h?.startsWith(`Bearer ${TEST_PREFIX}`) ? h.slice(7).trim() : undefined;
    if (!key) return next("router");
    const app = store.appByTestKey(key);
    if (!app) return next(new HttpError(401, "Unknown test API key", "unauthenticated"));
    res.locals.app = app;
    next();
  };
  r.use(requireTestKey);

  const at = () => new Date().toISOString();
  const op = (kind: string, fields: Record<string, unknown>, hash: string) => ({ kind, ...fields, at: at(), txHash: hash, test: true });

  function once<T>(app: Address, kind: string, ref: string, run: () => T): T | (T & { replayed: true }) {
    const k = `${app}:${kind}:${ref}`;
    if (results.has(k)) return { ...(results.get(k) as T), replayed: true };
    const value = run();
    results.set(k, value);
    return value;
  }

  r.get("/app", (_req, res) => {
    const app = appOf(res);
    res.json({
      id: app.id,
      name: app.name,
      payout: app.payout,
      feeBps: app.feeBps,
      prices: app.prices,
      unpaidEarnings: amount(sandbox.earnings(app.id)),
      test: true,
    });
  });

  r.get("/prices", (_req, res) => res.json(appOf(res).prices));

  r.get("/quote", (req, res) => {
    const app = appOf(res);
    const { units, label } = resolveAmount(amountInputSchema.parse(req.query), app.prices);
    const fee = (units * BigInt(app.feeBps)) / 10_000n;
    res.json({ label, price: amount(units), networkFee: amount(fee), youEarn: amount(units - fee), test: true });
  });

  r.get("/users/:address", (req, res) => {
    const user = addressSchema.parse(req.params.address);
    const { balance, limit } = sandbox.user(appOf(res).id, user);
    res.json({
      user,
      balance: amount(balance),
      connected: limit > 0n,
      limit: amount(limit),
      limitExpiresAt: null,
      spendable: amount(balance < limit ? balance : limit),
      test: true,
    });
  });

  /** In test mode any `cc_test_<address>` code connects that address, with no hosted page. */
  r.post("/connect/exchange", (req, res) => {
    const code = String(req.body?.code ?? "");
    const address = code.startsWith("cc_test_") ? code.slice(8) : "";
    if (!isAddress(address)) throw new HttpError(400, "In test mode, use the code cc_test_<address>", "bad_code");
    const user = getAddress(address);
    res.json({ user, email: null, limit: amount(sandbox.user(appOf(res).id, user).limit), test: true });
  });

  r.post("/charges", (req, res) => {
    const app = appOf(res);
    const body = chargeSchema.parse(req.body);
    const ref = body.ref ?? newRef();
    const result = once(app.id, "charge", ref, () => {
      const { units, label } = resolveAmount(body, app.prices);
      const { fee, hash } = sandbox.charge(app.id, body.user, units, onchainRef("charge", ref), app.feeBps);
      return op("charge", { ref, user: body.user, amount: amount(units), fee: amount(fee), label }, hash);
    });
    res.status(201).json(result);
  });

  r.post("/holds", (req, res) => {
    const app = appOf(res);
    const body = holdSchema.parse(req.body);
    const ref = body.ref ?? newRef();
    const result = once(app.id, "hold", ref, () => {
      const { units, label } = resolveAmount(body, app.prices);
      const ttl = Math.min(body.ttlSeconds ?? config.holdTtlSeconds, config.holdTtlSeconds);
      const expiry = Math.floor(Date.now() / 1000) + ttl;
      const { holdId, hash } = sandbox.hold(app.id, body.user, units, onchainRef("hold", ref), expiry);
      return { ...op("hold", { ref, user: body.user, amount: amount(units), label, holdId }, hash), expiresAt: new Date(expiry * 1000).toISOString() };
    });
    res.status(201).json(result);
  });

  r.get("/holds/:holdId", (req, res) => {
    const h = sandbox.getHold(appOf(res).id, req.params.holdId);
    if (!h) throw new HttpError(404, "No such hold for this app", "not_found");
    res.json({ holdId: req.params.holdId, user: h.user, amount: amount(h.units), status: h.status, expiresAt: new Date(h.expiry * 1000).toISOString(), test: true });
  });

  r.post("/holds/:holdId/capture", (req, res) => {
    const app = appOf(res);
    const holdId = req.params.holdId;
    const result = once(app.id, "capture", holdId, () => {
      const h = sandbox.getHold(app.id, holdId);
      if (!h) throw new HttpError(404, "No such hold for this app", "not_found");
      const credits = z.object({ credits: creditsSchema.optional() }).parse(req.body ?? {}).credits;
      const actual = credits === undefined ? h.units : creditsToUnits(credits);
      const { fee, returned, hash } = sandbox.capture(app.id, holdId, actual, app.feeBps);
      return { ...op("capture", { ref: holdId, user: h.user, amount: amount(actual), fee: amount(fee), holdId }, hash), returned: amount(returned) };
    });
    res.json(result);
  });

  r.post("/holds/:holdId/release", (req, res) => {
    const app = appOf(res);
    const holdId = req.params.holdId;
    const result = once(app.id, "release", holdId, () => {
      const h = sandbox.getHold(app.id, holdId);
      if (!h) throw new HttpError(404, "No such hold for this app", "not_found");
      const { hash } = sandbox.release(app.id, holdId);
      return op("release", { ref: holdId, user: h.user, amount: amount(h.units), holdId }, hash);
    });
    res.json(result);
  });

  r.post("/refunds", (req, res) => {
    const app = appOf(res);
    const body = z.object({ user: addressSchema, credits: creditsSchema, ref: refSchema.optional() }).parse(req.body);
    const ref = body.ref ?? newRef();
    const result = once(app.id, "refund", ref, () => {
      const units = creditsToUnits(body.credits);
      const { hash } = sandbox.refund(app.id, body.user, units, onchainRef("refund", ref));
      return op("refund", { ref, user: body.user, amount: amount(units) }, hash);
    });
    res.status(201).json(result);
  });

  /** Back to fresh test users: 1,000 credits each, a 500 credit limit. */
  r.post("/sandbox/reset", (_req, res) => {
    sandbox.reset(appOf(res).id);
    res.json({ ok: true, test: true });
  });

  r.use((_req, _res, next) => next(new HttpError(400, "Not available in test mode. Use a live key for payouts, webhooks and reporting.", "test_mode_unsupported")));

  return r;
}
