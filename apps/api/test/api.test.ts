/**
 * End to end over HTTP against a throwaway anvil chain: a company registers, a user buys,
 * connects and spends, and the company holds, captures, refunds and gets paid out.
 * Privy is replaced by a fake verifier; users sign with local keys, exactly as their Privy
 * wallet would sign the same EIP-712 messages in the browser.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { mockUSDTAbi } from "../src/abi/MockUSDT.js";
import { AuthError, type UserVerifier } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { createContext, type Context } from "../src/context.js";
import { createServer } from "../src/server.js";
import { ANVIL_KEY, skipChainTests as skip, startLocalChain, type LocalChain } from "./localChain.js";
import { vaultTypes } from "../src/typedData.js";

type Json = Record<string, any>;

let chain: LocalChain | undefined;
let ctx: Context;
let base: string;
let close: () => void;
let apiKey: string;
let appId: Address;

const alice = privateKeyToAccount(generatePrivateKey());
const bob = privateKeyToAccount(generatePrivateKey());
const payout = privateKeyToAccount(generatePrivateKey()).address;

/** Fake Privy: the token is the user's name. */
const users: Record<string, { account: PrivateKeyAccount; email: string }> = {
  alice: { account: alice, email: "alice@example.com" },
  bob: { account: bob, email: "bob@example.com" },
};
const verifier: UserVerifier = async (token) => {
  const u = users[token];
  if (!u) throw new AuthError("bad token");
  return { privyId: `did:privy:${token}`, address: u.account.address, email: u.email };
};

async function call(method: string, path: string, opts: { body?: unknown; key?: string; user?: string; admin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  if (opts.admin) headers.authorization = `Bearer ${opts.admin}`;
  if (opts.user) headers["privy-id-token"] = opts.user;
  const res = await fetch(`${base}${path}`, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await res.text();
  const body = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
  return { status: res.status, body } as { status: number; body: any };
}

const company = (method: string, path: string, body?: unknown) => call(method, path, { key: apiKey, body });

/** What the browser does: sign the returned EIP-712 request with the user's wallet. */
async function sign(account: PrivateKeyAccount, request: Json): Promise<Hex> {
  const fields: { name: string; type: string }[] = request.types[request.primaryType];
  const message: Json = {};
  for (const f of fields) {
    const v = request.message[f.name];
    message[f.name] = f.type.startsWith("uint") ? BigInt(v) : v;
  }
  return account.signTypedData({ domain: request.domain, types: request.types, primaryType: request.primaryType, message });
}

/** sign/:action then submit/:action, as our hosted pages do. */
async function act(user: string, action: string, input: Json) {
  const prepared = await call("POST", `/v1/me/sign/${action}`, { user, body: input });
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  const signature = await sign(users[user].account, prepared.body.request);
  return call("POST", `/v1/me/submit/${action}`, { user, body: { message: prepared.body.request.message, signature } });
}

before(async () => {
  if (skip) return;
  chain = await startLocalChain();
  const config = loadConfig({
    RPC_URL: chain.rpcUrl,
    VAULT_ADDRESS: chain.vault,
    USDT_ADDRESS: chain.usdt,
    DATA_DIR: mkdtempSync(join(tmpdir(), "uc-api-")),
    OPERATOR_KEY: ANVIL_KEY,
  });
  ctx = await createContext(config, { verifier });
  const server = createServer(ctx).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();

  // Alice holds $20 of test USDT in her wallet, as if from the Whitechain booth.
  const hash = await chain.clients.walletClient.writeContract({
    address: chain.usdt,
    abi: mockUSDTAbi,
    functionName: "mint",
    args: [alice.address, 20_000_000n],
  });
  await chain.clients.publicClient.waitForTransactionReceipt({ hash });
});

after(() => {
  close?.();
  chain?.stop();
});

describe("api", { skip }, () => {
  test("health and reserves", async () => {
    const h = await call("GET", "/v1/health");
    assert.equal(h.status, 200);
    assert.equal(h.body.login, "privy");
    const r = await call("GET", "/v1/reserves");
    assert.equal(r.body.backed, true);
  });

  test("admin registers an app and returns its key once", async () => {
    const bad = await call("POST", "/v1/admin/apps", { admin: "wrong-token", body: { name: "Video Studio", payout } });
    assert.equal(bad.status, 401);

    const res = await call("POST", "/v1/admin/apps", { admin: "dev-admin", body: { name: "Video Studio", payout } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.apiKey, /^uc_live_/);
    apiKey = res.body.apiKey;
    appId = res.body.id;

    const me = await company("GET", "/v1/app");
    assert.equal(me.body.name, "Video Studio");
    assert.equal(me.body.feeBps, 500);
  });

  test("company calls need a valid API key", async () => {
    assert.equal((await call("GET", "/v1/app")).status, 401);
    assert.equal((await call("GET", "/v1/app", { key: "uc_live_nope" })).status, 401);
  });

  test("company sets prices and quotes in credits and dollars", async () => {
    const put = await company("PUT", "/v1/prices", {
      prices: { "video.render": { rate: "8", unit: "second" }, "chat.message": { price: 2 } },
    });
    assert.equal(put.status, 200);
    const q = await company("GET", "/v1/quote?action=video.render&quantity=5");
    assert.deepEqual(q.body.price, { units: "400000", credits: "40", usd: "0.4" });
    assert.equal(q.body.youEarn.credits, "38");
  });

  test("user routes need a login", async () => {
    assert.equal((await call("GET", "/v1/me")).status, 401);
    assert.equal((await call("GET", "/v1/me", { user: "mallory" })).status, 401);
  });

  test("alice buys credits with a gasless permit", async () => {
    const res = await act("alice", "buy", { credits: 1000 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const me = await call("GET", "/v1/me", { user: "alice" });
    assert.equal(me.body.balance.credits, "1000");
    assert.equal(me.body.walletUsdt.usd, "10");
    assert.equal(me.body.email, "alice@example.com");
  });

  test("alice connects the app with a 200 credit limit", async () => {
    const res = await act("alice", "connect", { app: appId, credits: 200 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const u = await company("GET", `/v1/users/${alice.address}`);
    assert.equal(u.body.connected, true);
    assert.equal(u.body.limit.credits, "200");
  });

  test("a signed message can't be submitted by another account", async () => {
    const prepared = await call("POST", "/v1/me/sign/connect", { user: "alice", body: { app: appId, credits: 999 } });
    const signature = await sign(alice, prepared.body.request);
    const res = await call("POST", "/v1/me/submit/connect", {
      user: "bob",
      body: { message: prepared.body.request.message, signature },
    });
    assert.equal(res.status, 403);
  });

  test("company charges by action, and a retried ref doesn't charge twice", async () => {
    const first = await company("POST", "/v1/charges", { user: alice.address, action: "chat.message", ref: "msg-1" });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.amount.credits, "2");
    assert.equal(first.body.fee.credits, "0.1");

    const again = await company("POST", "/v1/charges", { user: alice.address, action: "chat.message", ref: "msg-1" });
    assert.equal(again.status, 200);
    assert.equal(again.body.replayed, true);
    assert.equal(again.body.txHash, first.body.txHash);

    const u = await company("GET", `/v1/users/${alice.address}`);
    assert.equal(u.body.balance.credits, "998");
  });

  test("the contract refuses a charge above the limit, with a clear error", async () => {
    const res = await company("POST", "/v1/charges", { user: alice.address, credits: 500 });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, "OverLimit");
  });

  test("hold, then capture part of it", async () => {
    const h = await company("POST", "/v1/holds", { user: alice.address, action: "video.render", quantity: 10, ref: "job-1" });
    assert.equal(h.status, 201, JSON.stringify(h.body));
    assert.equal(h.body.amount.credits, "80");

    const c = await company("POST", `/v1/holds/${h.body.holdId}/capture`, { credits: 40 });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(c.body.returned.credits, "40");
    const again = await company("POST", `/v1/holds/${h.body.holdId}/capture`, {});
    assert.equal(again.body.replayed, true);

    const u = await company("GET", `/v1/users/${alice.address}`);
    assert.equal(u.body.balance.credits, "958");
  });

  test("hold, then release returns everything", async () => {
    const h = await company("POST", "/v1/holds", { user: alice.address, credits: 30, ref: "job-2" });
    const r = await company("POST", `/v1/holds/${h.body.holdId}/release`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const u = await company("GET", `/v1/users/${alice.address}`);
    assert.equal(u.body.balance.credits, "958");
  });

  test("refund, light-mode convert and payout", async () => {
    const refund = await company("POST", "/v1/refunds", { user: alice.address, credits: 2, ref: "msg-1" });
    assert.equal(refund.status, 201, JSON.stringify(refund.body));

    await company("PUT", "/v1/exchange-rate", { rate: 2 });
    const conv = await company("POST", "/v1/convert", { user: alice.address, credits: 10 });
    assert.equal(conv.status, 201, JSON.stringify(conv.body));
    assert.equal(conv.body.appCredits, "5");

    const p = await company("POST", "/v1/payout");
    assert.equal(p.status, 200, JSON.stringify(p.body));
    const paid = await ctx.usdt.read.balanceOf([payout]);
    assert.equal(paid.toString(), p.body.amount.units);
  });

  test("send to a friend by email, then by claim link", async () => {
    await call("GET", "/v1/me", { user: "bob" }); // bob signs in once
    const sent = await act("alice", "send", { to: "bob@example.com", credits: 50 });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));

    const linkKey = privateKeyToAccount(generatePrivateKey());
    const created = await act("alice", "claim", { claimKey: linkKey.address, credits: 25 });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal((await call("GET", `/v1/claims/${linkKey.address}`)).body.status, "open");

    // Bob opens the link: the link's key signs bob's address in his browser.
    const signature = await linkKey.signTypedData({
      domain: { name: "CreditVault", version: "1", chainId: 31337, verifyingContract: ctx.config.vault },
      types: { RedeemClaim: vaultTypes.RedeemClaim },
      primaryType: "RedeemClaim",
      message: { claimKey: linkKey.address, to: bob.address },
    });
    const redeemed = await call("POST", `/v1/claims/${linkKey.address}/redeem`, { user: "bob", body: { signature } });
    assert.equal(redeemed.status, 200, JSON.stringify(redeemed.body));

    const me = await call("GET", "/v1/me", { user: "bob" });
    assert.equal(me.body.balance.credits, "75");
    assert.equal((await call("GET", `/v1/claims/${linkKey.address}`)).body.status, "claimed");
  });

  test("after disconnecting, the app can't charge", async () => {
    const res = await act("alice", "disconnect", { app: appId });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const charge = await company("POST", "/v1/charges", { user: alice.address, credits: 1 });
    assert.equal(charge.body.code, "OverLimit");
    const me = await call("GET", "/v1/me", { user: "alice" });
    assert.equal(me.body.connections[0].connected, false);
  });

  test("gas, CSV export and reserves", async () => {
    const gas = await company("GET", "/v1/gas");
    assert.ok(gas.body.transactions > 0);
    assert.equal(gas.body.paidBy, "network");

    const csv = await company("GET", "/v1/export.csv");
    assert.equal(csv.status, 200);
    const lines = String(csv.body).trim().split("\n");
    assert.equal(lines[0], "date,kind,ref,user,credits,usd,fee_credits,label,tx");
    assert.ok(lines.some((l) => l.includes(",capture,")));

    const r = await call("GET", "/v1/reserves");
    assert.equal(r.body.backed, true);
    assert.equal(r.body.surplus.units, "0");
  });
});
