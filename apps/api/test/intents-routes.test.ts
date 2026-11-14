/**
 * The buy-from-any-chain routes over HTTP. 1Click is replaced by a fake that records quotes; the
 * vault's NEP-145 storage views and the relayer's storage_deposit are stubbed, so these tests
 * check the API's decisions (register first, live vs dry, who may read which status) and not the
 * chain.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import express from "express";
import { KeyPair } from "near-api-js";
import { AuthError, type UserVerifier } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { createContext, type Context } from "../src/context.js";
import { errorHandler } from "../src/http.js";
import { createIntents, MAINNET_USDT } from "../src/intents.js";
import { intentsRoutes } from "../src/routes/intents.js";
import { createFakeChain, newUserKey } from "./fakeChain.js";

const chain = createFakeChain();
const alice = newUserKey();
const bob = newUserKey();
const people: Record<string, ReturnType<typeof newUserKey>> = { alice, bob };
const verifier: UserVerifier = async (token) => {
  const u = people[token];
  if (!u) throw new AuthError("bad token");
  return { privyId: `did:privy:${token}`, address: u.account, publicKey: u.publicKey, email: `${token}@example.com` };
};

/** What the fake 1Click and the stubbed chain saw. */
let quoteBodies: Record<string, any>[] = [];
let storageDeposits: Record<string, unknown>[] = [];
let registered = new Set<string>();
let ctx: Context;
const servers: { close(): void }[] = [];

const fake1Click = (async (url: string, init: RequestInit) => {
  if (url.endsWith("/v0/tokens")) {
    return Response.json([{ assetId: "nep141:base-usdc", symbol: "USDC", blockchain: "base", decimals: 6, price: 1 }]);
  }
  if (url.endsWith("/v0/quote")) {
    const body = JSON.parse(init.body as string);
    quoteBodies.push(body);
    return Response.json({
      signature: "ed25519:sig",
      quote: { amountIn: "5047839", amountInFormatted: "5.047839", amountOut: body.amount, depositAddress: body.dry ? undefined : `0xdeposit${quoteBodies.length}`, timeEstimate: 35 },
    });
  }
  if (url.includes("/v0/status")) {
    return Response.json({ status: "SUCCESS", swapDetails: { nearTxHashes: ["NearTx1"], originChainTxHashes: [{ hash: "0xorigin" }], amountOut: "5000000" } });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

/** Starts the intents routes on their own server, as `network` would see them. */
async function serve(env: Record<string, string>) {
  // A live vault holds real USDT; the guard in intentsRoutes checks it.
  const usdt = env.INTENTS_LIVE === "true" ? MAINNET_USDT : ctx.config.usdt;
  const stubbed = {
    ...ctx,
    config: { ...ctx.config, usdt },
    chain: {
      ...ctx.chain,
      view: async <T>(contract: string, method: string, args?: Record<string, unknown>): Promise<T> => {
        if (contract === ctx.config.vault && method === "storage_balance_of") {
          return (registered.has(String(args?.account_id)) ? { total: "1", available: "0" } : null) as T;
        }
        if (contract === ctx.config.vault && method === "storage_balance_bounds") return { min: "2500000000000000000000" } as T;
        return ctx.chain.view<T>(contract, method, args);
      },
    },
    relayer: {
      ...ctx.relayer,
      write: async (c: { method: string; args: Record<string, unknown>; deposit?: bigint }) => {
        storageDeposits.push({ method: c.method, args: c.args, deposit: c.deposit });
        registered.add(String(c.args.account_id));
        return {} as any;
      },
    },
  } as Context;
  const app = express();
  app.use(express.json());
  app.use("/v1", intentsRoutes(stubbed, { intents: createIntents({ fetch: fake1Click }), env }));
  app.use(errorHandler);
  const server = app.listen(0);
  servers.push(server);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return async (method: string, path: string, opts: { user?: string; body?: unknown } = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (opts.user) headers["privy-id-token"] = opts.user;
    const res = await fetch(`${base}${path}`, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    return { status: res.status, body: (await res.json()) as any };
  };
}

const buy = { originAsset: "nep141:base-usdc", credits: 500, refundTo: "0x1111111111111111111111111111111111111111" };

before(async () => {
  const config = loadConfig({
    VAULT_ACCOUNT_ID: chain.vault,
    USDT_ACCOUNT_ID: chain.usdt,
    RELAYER_ACCOUNT_ID: chain.relayerId,
    RELAYER_PRIVATE_KEY: KeyPair.fromRandom("ed25519").toString(),
    ADMIN_TOKEN: "dev-admin",
    DATA_DIR: mkdtempSync(join(tmpdir(), "kredo-intents-")),
  });
  ctx = await createContext(config, { verifier, memoryDb: true, chain });
});

beforeEach(() => {
  quoteBodies = [];
  storageDeposits = [];
  registered = new Set();
});

after(async () => {
  for (const s of servers) s.close();
  ctx?.indexer.stop();
  await ctx?.db.close();
});

describe("intents routes", () => {
  test("lists payable assets without a login, and says whether quotes are live", async () => {
    const call = await serve({ INTENTS_LIVE: "false" });
    const r = await call("GET", "/v1/intents/assets");
    assert.equal(r.status, 200);
    assert.equal(r.body.live, false);
    assert.deepEqual(r.body.assets, [{ assetId: "nep141:base-usdc", symbol: "USDC", chain: "base", decimals: 6, priceUsd: 1 }]);
  });

  test("a quote needs a login", async () => {
    const call = await serve({ INTENTS_LIVE: "true" });
    assert.equal((await call("POST", "/v1/me/intents/quote", { body: buy })).status, 401);
  });

  test("live: registers the user's vault storage first, then quotes into the vault for that user", async () => {
    const call = await serve({ INTENTS_LIVE: "true" });
    const r = await call("POST", "/v1/me/intents/quote", { user: "alice", body: buy });
    assert.equal(r.status, 200, JSON.stringify(r.body));

    assert.deepEqual(storageDeposits, [
      { method: "storage_deposit", args: { account_id: alice.account, registration_only: true }, deposit: 2_500_000_000_000_000_000_000n },
    ]);
    assert.equal(quoteBodies.length, 1);
    assert.equal(quoteBodies[0].dry, false);
    assert.equal(quoteBodies[0].recipient, ctx.config.vault);
    assert.equal(quoteBodies[0].amount, "5000000", "500 credits = $5 = 5,000,000 USDT units");
    assert.equal(quoteBodies[0].customRecipientMsg, JSON.stringify({ user: alice.account }));
    assert.equal(r.body.live, true);
    assert.equal(r.body.depositAddress, "0xdeposit1");
    assert.equal(r.body.credits.credits, "500");
  });

  test("live: an already registered user isn't registered again", async () => {
    registered.add(alice.account);
    const call = await serve({ INTENTS_LIVE: "true" });
    assert.equal((await call("POST", "/v1/me/intents/quote", { user: "alice", body: buy })).status, 200);
    assert.deepEqual(storageDeposits, []);
  });

  test("dry (testnet): a real price, no deposit address, and nothing written onchain", async () => {
    const call = await serve({ INTENTS_LIVE: "false" });
    const r = await call("POST", "/v1/me/intents/quote", { user: "alice", body: buy });
    assert.equal(r.status, 200);
    assert.equal(quoteBodies[0].dry, true);
    // 1Click only quotes to real mainnet accounts, so the preview uses stand-ins for the testnet vault and USDT.
    assert.equal(quoteBodies[0].recipient, "intents.near");
    assert.equal(quoteBodies[0].destinationAsset, `nep141:${MAINNET_USDT}`);
    assert.equal(r.body.live, false);
    assert.equal(r.body.depositAddress, undefined);
    assert.match(r.body.note, /Preview only/);
    assert.deepEqual(storageDeposits, []);
  });

  test("won't run live quotes for a vault that doesn't hold real USDT", () => {
    assert.throws(() => intentsRoutes(ctx, { intents: createIntents({ fetch: fake1Click }), env: { INTENTS_LIVE: "true" } }), /needs a vault holding usdt.tether-token.near/);
  });

  test("refuses amounts under 1 credit or over the cap", async () => {
    const call = await serve({ INTENTS_LIVE: "true", INTENTS_MAX_CREDITS: "1000" });
    assert.equal((await call("POST", "/v1/me/intents/quote", { user: "alice", body: { ...buy, credits: 0.5 } })).body.code, "below_minimum");
    assert.equal((await call("POST", "/v1/me/intents/quote", { user: "alice", body: { ...buy, credits: 1001 } })).body.code, "above_maximum");
    assert.equal(quoteBodies.length, 0);
  });

  test("status: the buyer sees the swap's NEAR transactions and their balance; someone else can't", async () => {
    const call = await serve({ INTENTS_LIVE: "true" });
    const q = await call("POST", "/v1/me/intents/quote", { user: "alice", body: buy });
    const path = `/v1/me/intents/status?depositAddress=${q.body.depositAddress}`;

    const s = await call("GET", path, { user: "alice" });
    assert.equal(s.status, 200, JSON.stringify(s.body));
    assert.equal(s.body.status, "SUCCESS");
    assert.equal(s.body.settled, true);
    assert.deepEqual(s.body.nearTxs.map((t: { hash: string }) => t.hash), ["NearTx1"]);
    assert.ok(s.body.balance, "the balance comes with a settled status");

    assert.equal((await call("GET", path, { user: "bob" })).status, 404);
  });
});
