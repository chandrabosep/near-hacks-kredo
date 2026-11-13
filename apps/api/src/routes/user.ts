/**
 * Routes our hosted pages call for a logged-in user (Privy identity token).
 *
 * Every credit-moving action takes two calls:
 *   POST /v1/me/sign/:action    -> the hash of a NEAR delegate action (NEP-366) for the user's account
 *   POST /v1/me/submit/:action  -> { hash, signature }, relayed onchain
 * The user signs with their Privy NEAR wallet in the browser. The vault sees the user as the
 * caller, and the relayer only pays the gas: it can't change what was signed.
 */
import { Router } from "express";
import { z } from "zod";
import type { Context } from "../context.js";
import { HttpError, perIp, requireUser, userOf } from "../http.js";
import { MetaError, type UserCall } from "../meta.js";
import { ONE_YOCTO, TGAS, toPublicKey, type AccountId } from "../near.js";
import { RelayerError } from "../relayer.js";
import type { UserRecord } from "../store.js";
import { amount, creditsToUnits } from "../units.js";
import { accountIdSchema, activityFor, appIdSchema, claimKeySchema, creditsSchema, involves, txInfo } from "./shared.js";

const hex = (bytes: number) => z.string().regex(new RegExp(`^(0x)?[0-9a-fA-F]{${bytes * 2}}$`), `must be ${bytes} bytes of hex`);
const DAY = 86_400;

export function userRoutes(ctx: Context): Router {
  const r = Router();
  const { store, relayer, config, vault, meta, chain, storage } = ctx;

  // Only these paths need a Privy login. Everything else falls through to the next router.
  r.use(["/me", "/claims/:claimKey/redeem"], requireUser(ctx.verifier, store, config.signupsPerIpPerHour));

  const me = (res: Parameters<typeof userOf>[0]) => userOf(res).address;

  async function resolveRecipient(to: string): Promise<AccountId> {
    if (to.includes("@")) {
      const u = store.userByEmail(to);
      if (!u) {
        throw new HttpError(404, "Nobody with that email has signed in yet. Send a claim link instead.", "unknown_email");
      }
      return u.address;
    }
    return accountIdSchema.parse(to);
  }

  /**
   * A new user's implicit account doesn't exist onchain until it receives NEAR. The relayer sends
   * a little, so the account can sign, and registers it with the USDT token so it can hold USDT.
   */
  async function ensureAccount(user: { address: AccountId; publicKey: string }) {
    const nonce = await chain.accessKeyNonce(user.address, toPublicKey(user.publicKey));
    if (nonce === undefined) {
      await relayer.send(user.address, [{ kind: "transfer", amount: config.userAccountYocto }], { fn: "activate_account" });
    }
    if (!(await vault.usdtRegistered(user.address))) {
      await relayer.write({
        receiver: config.usdt,
        method: "storage_deposit",
        args: { account_id: user.address, registration_only: true },
        deposit: await vault.usdtStorageCost(),
      });
    }
  }

  const limitView = (limit: { remaining: bigint; expiry: number }) => {
    const expired = limit.expiry !== 0 && limit.expiry <= Math.floor(Date.now() / 1000);
    return { remaining: expired ? 0n : limit.remaining, expired, expiresAt: limit.expiry === 0 ? null : new Date(limit.expiry * 1000).toISOString() };
  };

  // ---------------------------------------------------------------- profile

  r.get("/me", async (_req, res) => {
    const u = userOf(res);
    const apps = store.listApps();
    const [balance, wallet, limits] = await Promise.all([
      vault.balanceOf(u.address),
      vault.usdtBalanceOf(u.address),
      Promise.all(apps.map((a) => vault.limitOf(u.address, a.id))),
    ]);
    const connections = apps
      .map((a, i) => ({ app: a, limit: limits[i] }))
      .filter(({ limit }) => limit.version > 0)
      .map(({ app, limit }) => {
        const l = limitView(limit);
        return { app: app.id, name: app.name, connected: !l.expired && l.remaining > 0n, limit: amount(l.remaining), expiresAt: l.expiresAt };
      });
    res.json({
      account: u.address,
      email: u.email ?? null,
      balance: amount(balance),
      walletUsdt: amount(wallet),
      faucet: faucetState(u.record, wallet),
      connections,
      claims: store.claimsFrom(u.address).map((c) => ({
        claimKey: c.claimKey,
        amount: amount(c.units),
        status: c.status,
        expiresAt: new Date(c.expiry * 1000).toISOString(),
      })),
    });
  });

  // ---------------------------------------------------------------- faucet

  /** Whether this user can take test USDT now, and how much. Null when the faucet is off. */
  const faucetState = (u: { faucetAt?: number }, wallet: bigint) => {
    const f = config.faucet;
    if (!f) return null;
    return { usdt: f.usdt, claimed: u.faucetAt !== undefined, available: u.faucetAt === undefined && wallet < f.units };
  };

  const claimsToday = () => {
    const since = Date.now() - 86_400_000;
    return store.listUsers().filter((u) => u.faucetAt !== undefined && u.faucetAt > since).length;
  };

  const faucetLimit = config.faucet ? perIp(config.faucet.perIpPerHour, 3_600_000, "Too many test USDT requests from this network.") : undefined;

  /**
   * Test USDT from the relayer's account, so anyone can try the network without hunting for a faucet.
   * Once per account, only while their wallet is nearly empty, under per-IP and daily caps.
   */
  r.post("/me/faucet", (req, res, next) => (faucetLimit ? faucetLimit(req, res, next) : next()), async (_req, res) => {
    const f = config.faucet;
    if (!f) throw new HttpError(404, "The test USDT faucet is off", "faucet_off");
    const u = userOf(res);
    if (u.record.faucetAt !== undefined) throw new HttpError(409, "You've already had test USDT on this account", "faucet_claimed");
    const wallet = await vault.usdtBalanceOf(u.address);
    if (wallet >= f.units) throw new HttpError(409, "Your wallet already holds test USDT", "faucet_not_needed");
    if (claimsToday() >= f.dailyLimit) throw new HttpError(503, "Today's test USDT is all handed out. Try again tomorrow.", "faucet_daily_limit");
    const left = await vault.usdtBalanceOf(relayer.operator);
    if (left < f.units) throw new HttpError(503, "The faucet is out of test USDT", "faucet_empty");

    // Mark first, so a double click can't send twice. Undo if the transfer fails.
    store.setFaucetAt(u.record as UserRecord, Date.now());
    try {
      await ensureAccount(u);
      const { hash } = await relayer.write({
        receiver: config.usdt,
        method: "ft_transfer",
        args: { receiver_id: u.address, amount: f.units.toString(), memo: "Kredo test USDT" },
        deposit: ONE_YOCTO,
      });
      res.json({ usdt: f.usdt, ...txInfo(ctx, hash) });
    } catch (err) {
      store.setFaucetAt(u.record as UserRecord, undefined);
      throw err;
    }
  });

  /** Everything that moved this user's credits, newest first. */
  r.get("/me/activity", (req, res) => {
    res.json(activityFor(ctx, involves(me(res)), req.query.limit));
  });

  /** Already connected: a fresh code to hand back to the app, with no new signature. */
  r.post("/me/connect-code", async (req, res) => {
    const app = appIdSchema.parse(req.body?.app);
    if (!store.appById(app)) throw new HttpError(404, "No such app", "not_found");
    const l = limitView(await vault.limitOf(me(res), app));
    if (l.remaining === 0n) throw new HttpError(409, "Connect this app first", "not_connected");
    res.json({ code: ctx.codes.issue(app, me(res)) });
  });

  // ---------------------------------------------------------------- sign

  const signSchemas = {
    connect: z.object({ app: appIdSchema, credits: creditsSchema, expiresInDays: z.number().int().min(1).max(365).optional() }),
    disconnect: z.object({ app: appIdSchema }),
    send: z.object({ to: z.string().min(2), credits: creditsSchema }),
    claim: z.object({ claimKey: claimKeySchema, credits: creditsSchema, expiresInDays: z.number().int().min(1).max(90).optional() }),
    buy: z.object({ credits: creditsSchema }),
  };
  type Action = keyof typeof signSchemas;
  const isAction = (a: string): a is Action => a in signSchemas;

  const minimum = (units: bigint) => {
    if (units < config.minSendUnits) {
      throw new HttpError(400, `The smallest amount is ${amount(config.minSendUnits).credits} credits`, "below_minimum");
    }
  };

  /** What one action calls, what the user is told, and what the submit step needs to remember. */
  async function build(action: Action, body: unknown, account: AccountId): Promise<{ call: UserCall; summary?: string; meta: Record<string, unknown> }> {
    switch (action) {
      case "connect": {
        const b = signSchemas.connect.parse(body);
        const app = store.appById(b.app);
        if (!app) throw new HttpError(404, "No such app", "not_found");
        const expiry = b.expiresInDays ? Math.floor(Date.now() / 1000) + b.expiresInDays * DAY : null;
        const limit = creditsToUnits(b.credits);
        return {
          summary: `${app.name} can spend up to ${amount(limit).credits} credits ($${amount(limit).usd})`,
          call: { receiver: config.vault, method: "approve_app", args: { app: app.id, limit: limit.toString(), expiry } },
          meta: { app: app.id, limit: limit.toString() },
        };
      }
      case "disconnect": {
        const b = signSchemas.disconnect.parse(body);
        return { call: { receiver: config.vault, method: "revoke_app", args: { app: b.app } }, meta: { app: b.app } };
      }
      case "send": {
        const b = signSchemas.send.parse(body);
        const to = await resolveRecipient(b.to);
        if (to === account) throw new HttpError(400, "That's your own account", "self_send");
        const units = creditsToUnits(b.credits);
        minimum(units);
        return {
          summary: `Send ${amount(units).credits} credits to ${b.to}`,
          call: { receiver: config.vault, method: "send", args: { to, amount: units.toString() } },
          meta: { to, amount: units.toString() },
        };
      }
      case "claim": {
        const b = signSchemas.claim.parse(body);
        const units = creditsToUnits(b.credits);
        minimum(units);
        const expiry = Math.floor(Date.now() / 1000) + (b.expiresInDays ?? 30) * DAY;
        return {
          summary: `A claim link for ${amount(units).credits} credits`,
          call: { receiver: config.vault, method: "create_claim", args: { amount: units.toString(), claim_key: b.claimKey, expiry } },
          meta: { claimKey: b.claimKey, amount: units.toString(), expiry },
        };
      }
      case "buy": {
        const b = signSchemas.buy.parse(body);
        const units = creditsToUnits(b.credits);
        const wallet = await vault.usdtBalanceOf(account);
        if (wallet < units) throw new HttpError(400, `Your wallet holds ${amount(wallet).usd} USDT`, "insufficient_usdt");
        return {
          summary: `Buy ${amount(units).credits} credits for ${amount(units).usd} USDT`,
          // NEP-141: the token moves USDT to the vault and calls its ft_on_transfer, which credits the sender.
          call: {
            receiver: config.usdt,
            method: "ft_transfer_call",
            args: { receiver_id: config.vault, amount: units.toString(), msg: "" },
            gas: 100n * TGAS,
            deposit: ONE_YOCTO,
          },
          meta: { amount: units.toString() },
        };
      }
    }
  }

  r.post("/me/sign/:action", async (req, res) => {
    const action = req.params.action;
    if (!isAction(action)) throw new HttpError(404, `Unknown action "${action}"`, "not_found");
    const u = userOf(res);
    const { call, summary, meta: m } = await build(action, req.body, u.address);
    await ensureAccount(u);
    const prepared = await meta.prepare(u.address, u.publicKey, call, { ...m, action });
    res.json({ summary, request: { account: u.address, ...prepared } });
  });

  // ---------------------------------------------------------------- submit

  const submitSchema = z.object({ hash: hex(32), signature: hex(64) });

  r.post("/me/submit/:action", async (req, res) => {
    const action = req.params.action;
    if (!isAction(action)) throw new HttpError(404, `Unknown action "${action}"`, "not_found");
    const u = userOf(res);
    const body = submitSchema.parse(req.body);
    let p;
    try {
      p = meta.take(u.address, body.hash, body.signature);
    } catch (err) {
      if (err instanceof MetaError) throw new HttpError(err.status, err.message, err.code);
      throw err;
    }
    if (p.meta.action !== action) throw new HttpError(400, `That request is for "${String(p.meta.action)}"`, "wrong_action");
    const app = typeof p.meta.app === "string" ? p.meta.app : undefined;
    const relay = () =>
      relayer.send(u.address, [{ kind: "delegate", delegate: p.delegate, signature: p.signature }], {
        fn: String(p.meta.method),
        app,
      });
    // The vault holds nothing for an account nobody paid storage for, and takes a user's new limit or
    // claim link from their own storage balance. The relayer registers and tops up first.
    let result;
    if (action === "buy") {
      await storage.ensureRegistered(u.address);
      result = await relay();
    } else if (action === "send") {
      await storage.ensureRegistered(String(p.meta.to));
      result = await relay();
    } else if (action === "connect" || action === "claim") {
      result = await storage.withHeadroom(u.address, relay);
    } else {
      result = await relay();
    }
    const { hash } = result;

    switch (action) {
      case "connect": {
        // The app gets a one-time code, never the account itself. Its server swaps it with its API key.
        const code = ctx.codes.issue(app!, u.address);
        return void res.status(201).json({ app, limit: amount(BigInt(String(p.meta.limit))), code, ...txInfo(ctx, hash) });
      }
      case "disconnect":
        return void res.json({ app, ...txInfo(ctx, hash) });
      case "send":
        return void res.status(201).json({ to: p.meta.to, amount: amount(BigInt(String(p.meta.amount))), ...txInfo(ctx, hash) });
      case "claim": {
        const claimKey = String(p.meta.claimKey);
        const units = BigInt(String(p.meta.amount));
        store.putClaim({ claimKey, from: u.address, units, expiry: Number(p.meta.expiry), status: "open", txHash: hash, createdAt: Date.now() });
        return void res.status(201).json({ claimKey, amount: amount(units), ...txInfo(ctx, hash) });
      }
      case "buy": {
        // If the vault turned the deposit down, the token refunds it, and there's no deposited event.
        if (!result.events.some((e) => e.event === "deposited")) {
          const refunded = result.events.find((e) => e.event === "deposit_refunded");
          throw new RelayerError(refunded?.data.reason === "not_registered" ? "NotRegistered" : "DepositRefunded", hash);
        }
        return void res.status(201).json({ amount: amount(BigInt(String(p.meta.amount))), ...txInfo(ctx, hash) });
      }
    }
  });

  // ---------------------------------------------------------------- claim links

  /** The exact text a claim link's key signs to redeem it to the logged-in user. */
  r.get("/me/claims/:claimKey/message", async (req, res) => {
    const claimKey = claimKeySchema.parse(req.params.claimKey);
    res.json({ claimKey, to: me(res), message: await vault.claimMessage(claimKey, me(res)) });
  });

  /** Redeems a claim link to the logged-in user. The link's key signed this user's account. */
  const claimLimit = perIp(config.claimsPerIpPerHour, 3_600_000, "Too many claims from this network.");
  r.post("/claims/:claimKey/redeem", claimLimit, async (req, res) => {
    const claimKey = claimKeySchema.parse(req.params.claimKey);
    const sig = hex(64).parse(req.body?.signature);
    const to = me(res);
    const before = await vault.getClaim(claimKey);
    if (!before || before.status !== "Open") throw new RelayerError("ClaimNotOpen");
    await storage.ensureRegistered(to);
    const { hash } = await relayer.write({
      method: "claim",
      args: { claim_key: claimKey, to, signature: Buffer.from(sig.replace(/^0x/, ""), "hex").toString("base64") },
    });
    store.setClaimStatus(claimKey, "claimed");
    res.json({ claimKey, to, amount: amount(before.amount), ...txInfo(ctx, hash) });
  });

  /** Cancels a link the user created. The relayer submits it; credits return to the creator. */
  r.post("/me/claims/:claimKey/cancel", async (req, res) => {
    const claimKey = claimKeySchema.parse(req.params.claimKey);
    const c = await vault.getClaim(claimKey);
    if (!c) throw new HttpError(404, "No such claim link", "not_found");
    if (c.from !== me(res)) throw new HttpError(403, "That link isn't yours", "not_yours");
    const { hash } = await relayer.write({ method: "cancel_claim", args: { claim_key: claimKey } });
    store.setClaimStatus(claimKey, "cancelled");
    res.json({ claimKey, amount: amount(c.amount), ...txInfo(ctx, hash) });
  });

  return r;
}
