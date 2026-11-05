/**
 * Routes our hosted pages call for a logged-in user (Privy identity token).
 *
 * Every credit-moving action takes two calls:
 *   POST /v1/me/sign/:action    -> an EIP-712 message with a fresh nonce and deadline
 *   POST /v1/me/submit/:action  -> { message, signature }, relayed onchain
 * The user signs with their Privy wallet in the browser. The signer is always the logged-in
 * user, and the contract checks every field, so the relayer can't change anything.
 */
import { Router } from "express";
import { getAddress, isHex, parseSignature, type Address, type Hex } from "viem";
import { z } from "zod";
import { creditVaultAbi } from "../abi/CreditVault.js";
import type { Context } from "../context.js";
import { HttpError, requireUser, userOf } from "../http.js";
import { deadlineIn, newNonce, permitTypes, signRequest, usdtDomain, vaultDomain } from "../typedData.js";
import { amount, creditsToUnits } from "../units.js";
import { addressSchema, creditsSchema, txInfo } from "./shared.js";

const uint = z.string().regex(/^\d+$/, "must be a whole number");
const bytes32 = z.string().refine((v) => isHex(v) && v.length === 66, "must be 32 bytes");
const signature = z.string().refine((v) => isHex(v) && v.length >= 130, "must be a signature");
const DAY = 86_400;

export function userRoutes(ctx: Context): Router {
  const r = Router();
  const { store, relayer, config } = ctx;
  const domain = vaultDomain(config.chainId, config.vault);
  const v = config.vault;

  // Only these paths need a Privy login. Everything else falls through to the next router.
  r.use(["/me", "/claims/:claimKey/redeem"], requireUser(ctx.verifier, store));

  const me = (res: Parameters<typeof userOf>[0]) => userOf(res).address;

  function requireSigner(message: { user?: string; from?: string; owner?: string }, address: Address) {
    const signer = message.user ?? message.from ?? message.owner;
    if (!signer || getAddress(signer) !== address) {
      throw new HttpError(403, "That message is for a different account", "wrong_signer");
    }
  }

  async function resolveRecipient(to: string): Promise<Address> {
    if (to.includes("@")) {
      const u = store.userByEmail(to);
      if (!u) {
        throw new HttpError(404, "Nobody with that email has signed in yet. Send a claim link instead.", "unknown_email");
      }
      return u.address;
    }
    return addressSchema.parse(to);
  }

  // ---------------------------------------------------------------- profile

  r.get("/me", async (_req, res) => {
    const u = userOf(res);
    const apps = store.listApps();
    const [balance, wallet, limits] = await Promise.all([
      ctx.vault.read.balanceOf([u.address]),
      ctx.usdt.read.balanceOf([u.address]),
      Promise.all(apps.map((a) => ctx.vault.read.limitOf([u.address, a.id]))),
    ]);
    const now = Math.floor(Date.now() / 1000);
    const connections = apps
      .map((a, i) => ({ app: a, limit: limits[i] }))
      .filter(({ limit }) => limit.version > 0)
      .map(({ app, limit }) => {
        const expired = limit.expiry !== 0n && Number(limit.expiry) <= now;
        return {
          app: app.id,
          name: app.name,
          connected: !expired && limit.remaining > 0n,
          limit: amount(expired ? 0n : limit.remaining),
          expiresAt: limit.expiry === 0n ? null : new Date(Number(limit.expiry) * 1000).toISOString(),
        };
      });
    res.json({
      address: u.address,
      email: u.email ?? null,
      balance: amount(balance),
      walletUsdt: amount(wallet),
      connections,
      claims: store.claimsFrom(u.address).map((c) => ({
        claimKey: c.claimKey,
        amount: amount(c.units),
        status: c.status,
        expiresAt: new Date(c.expiry * 1000).toISOString(),
      })),
    });
  });

  // ---------------------------------------------------------------- sign

  const signSchemas = {
    connect: z.object({ app: addressSchema, credits: creditsSchema, expiresInDays: z.number().int().min(1).max(365).optional() }),
    disconnect: z.object({ app: addressSchema }),
    send: z.object({ to: z.string().min(3), credits: creditsSchema }),
    claim: z.object({ claimKey: addressSchema, credits: creditsSchema, expiresInDays: z.number().int().min(1).max(90).optional() }),
    buy: z.object({ credits: creditsSchema }),
  };
  type Action = keyof typeof signSchemas;
  const isAction = (a: string): a is Action => a in signSchemas;

  r.post("/me/sign/:action", async (req, res) => {
    const action = req.params.action;
    if (!isAction(action)) throw new HttpError(404, `Unknown action "${action}"`, "not_found");
    const address = me(res);
    const deadline = String(deadlineIn());
    const nonce = newNonce();

    switch (action) {
      case "connect": {
        const b = signSchemas.connect.parse(req.body);
        const app = store.appById(b.app);
        if (!app) throw new HttpError(404, "No such app", "not_found");
        const expiry = b.expiresInDays ? Math.floor(Date.now() / 1000) + b.expiresInDays * DAY : 0;
        const limit = creditsToUnits(b.credits);
        return void res.json({
          summary: `${app.name} can spend up to ${amount(limit).credits} credits ($${amount(limit).usd})`,
          request: signRequest(domain, "ApproveApp", {
            user: address,
            app: app.id,
            limit: limit.toString(),
            expiry: String(expiry),
            nonce,
            deadline,
          }),
        });
      }
      case "disconnect": {
        const b = signSchemas.disconnect.parse(req.body);
        return void res.json({
          request: signRequest(domain, "RevokeApp", { user: address, app: b.app, nonce, deadline }),
        });
      }
      case "send": {
        const b = signSchemas.send.parse(req.body);
        const to = await resolveRecipient(b.to);
        if (to === address) throw new HttpError(400, "That's your own account", "self_send");
        const units = creditsToUnits(b.credits);
        return void res.json({
          summary: `Send ${amount(units).credits} credits to ${b.to}`,
          request: signRequest(domain, "Send", { from: address, to, amount: units.toString(), nonce, deadline }),
        });
      }
      case "claim": {
        const b = signSchemas.claim.parse(req.body);
        const units = creditsToUnits(b.credits);
        const expiry = Math.floor(Date.now() / 1000) + (b.expiresInDays ?? 30) * DAY;
        return void res.json({
          summary: `A claim link for ${amount(units).credits} credits`,
          request: signRequest(domain, "CreateClaim", {
            from: address,
            amount: units.toString(),
            claimKey: b.claimKey,
            expiry: String(expiry),
            nonce,
            deadline,
          }),
        });
      }
      case "buy": {
        const b = signSchemas.buy.parse(req.body);
        const value = creditsToUnits(b.credits);
        const tokenNonce = await ctx.usdt.read.nonces([address]);
        return void res.json({
          summary: `Buy ${amount(value).credits} credits for ${amount(value).usd} USDT`,
          request: {
            domain: usdtDomain(config.chainId, config.usdt, ctx.usdtName),
            types: permitTypes,
            primaryType: "Permit",
            message: { owner: address, spender: v, value: value.toString(), nonce: tokenNonce.toString(), deadline },
          },
        });
      }
    }
  });

  // ---------------------------------------------------------------- submit

  const submitSchemas = {
    connect: z.object({
      user: addressSchema,
      app: addressSchema,
      limit: uint,
      expiry: uint,
      nonce: bytes32,
      deadline: uint,
    }),
    disconnect: z.object({ user: addressSchema, app: addressSchema, nonce: bytes32, deadline: uint }),
    send: z.object({ from: addressSchema, to: addressSchema, amount: uint, nonce: bytes32, deadline: uint }),
    claim: z.object({
      from: addressSchema,
      amount: uint,
      claimKey: addressSchema,
      expiry: uint,
      nonce: bytes32,
      deadline: uint,
    }),
    buy: z.object({ owner: addressSchema, spender: addressSchema, value: uint, nonce: uint, deadline: uint }),
  };

  r.post("/me/submit/:action", async (req, res) => {
    const action = req.params.action;
    if (!isAction(action)) throw new HttpError(404, `Unknown action "${action}"`, "not_found");
    const address = me(res);
    const sig = signature.parse(req.body?.signature) as Hex;

    switch (action) {
      case "connect": {
        const m = submitSchemas.connect.parse(req.body?.message);
        requireSigner(m, address);
        const { hash } = await relayer.write(
          {
            address: v,
            abi: creditVaultAbi,
            functionName: "approveApp",
            args: [m.user, m.app, BigInt(m.limit), BigInt(m.expiry), m.nonce as Hex, BigInt(m.deadline), sig],
          },
          { app: m.app },
        );
        return void res.status(201).json({ app: m.app, limit: amount(BigInt(m.limit)), ...txInfo(ctx, hash) });
      }
      case "disconnect": {
        const m = submitSchemas.disconnect.parse(req.body?.message);
        requireSigner(m, address);
        const { hash } = await relayer.write(
          {
            address: v,
            abi: creditVaultAbi,
            functionName: "revokeApp",
            args: [m.user, m.app, m.nonce as Hex, BigInt(m.deadline), sig],
          },
          { app: m.app },
        );
        return void res.json({ app: m.app, ...txInfo(ctx, hash) });
      }
      case "send": {
        const m = submitSchemas.send.parse(req.body?.message);
        requireSigner(m, address);
        const { hash } = await relayer.write({
          address: v,
          abi: creditVaultAbi,
          functionName: "send",
          args: [m.from, m.to, BigInt(m.amount), m.nonce as Hex, BigInt(m.deadline), sig],
        });
        return void res.status(201).json({ to: m.to, amount: amount(BigInt(m.amount)), ...txInfo(ctx, hash) });
      }
      case "claim": {
        const m = submitSchemas.claim.parse(req.body?.message);
        requireSigner(m, address);
        const { hash } = await relayer.write({
          address: v,
          abi: creditVaultAbi,
          functionName: "createClaim",
          args: [m.from, BigInt(m.amount), m.claimKey, BigInt(m.expiry), m.nonce as Hex, BigInt(m.deadline), sig],
        });
        store.putClaim({
          claimKey: m.claimKey,
          from: m.from,
          units: BigInt(m.amount),
          expiry: Number(m.expiry),
          status: "open",
          txHash: hash,
          createdAt: Date.now(),
        });
        return void res.status(201).json({ claimKey: m.claimKey, amount: amount(BigInt(m.amount)), ...txInfo(ctx, hash) });
      }
      case "buy": {
        const m = submitSchemas.buy.parse(req.body?.message);
        requireSigner(m, address);
        if (m.spender !== v) throw new HttpError(400, "That permit isn't for this vault", "wrong_spender");
        const { r: rr, s, v: vv, yParity } = parseSignature(sig);
        const vByte = Number(vv ?? BigInt(yParity + 27));
        const { hash } = await relayer.write({
          address: v,
          abi: creditVaultAbi,
          functionName: "depositWithPermit",
          args: [m.owner, BigInt(m.value), BigInt(m.deadline), vByte, rr, s],
        });
        return void res.status(201).json({ amount: amount(BigInt(m.value)), ...txInfo(ctx, hash) });
      }
    }
  });

  // ---------------------------------------------------------------- claim links

  /** Redeem a claim link to the logged-in user. The link's key signs this user's address. */
  r.post("/claims/:claimKey/redeem", async (req, res) => {
    const claimKey = addressSchema.parse(req.params.claimKey);
    const sig = signature.parse(req.body?.signature) as Hex;
    const to = me(res);
    const { hash } = await relayer.write({
      address: v,
      abi: creditVaultAbi,
      functionName: "claim",
      args: [claimKey, to, sig],
    });
    store.setClaimStatus(claimKey, "claimed");
    const c = await ctx.vault.read.getClaim([claimKey]);
    res.json({ claimKey, to, amount: amount(c.amount), ...txInfo(ctx, hash) });
  });

  /** Cancel a link the user created. The operator submits it; credits return to the creator. */
  r.post("/me/claims/:claimKey/cancel", async (req, res) => {
    const claimKey = addressSchema.parse(req.params.claimKey);
    const c = await ctx.vault.read.getClaim([claimKey]);
    if (getAddress(c.from) !== me(res)) throw new HttpError(403, "That link isn't yours", "not_yours");
    const { hash } = await relayer.write({
      address: v,
      abi: creditVaultAbi,
      functionName: "cancelClaim",
      args: [claimKey],
    });
    store.setClaimStatus(claimKey, "cancelled");
    res.json({ claimKey, amount: amount(c.amount), ...txInfo(ctx, hash) });
  });

  return r;
}
